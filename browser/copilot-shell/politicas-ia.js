'use strict';
// Catálogo das políticas de IA/Copilot do Edge que o SuperPROC espelha como interruptores locais ("Configurações de IA avançadas" no CFG).
// Camada: host, sem Electron. O SuperPROC NÃO lê nem grava políticas do Edge (registro/ADMX): cada item é uma preferência própria, TODAS
// ligadas por padrão (listas vazias = sem restrição), e o Copilot as enxerga pela ponte (prefs.get pelo nome da política ou da preferência)
// e pela ferramenta superproc_get_ai_policies. Só alguns itens mudam o comportamento do SuperPROC (efeito 'ativo'); os demais são
// informativos: o Copilot fica sabendo do estado, mas nada no SuperPROC depende dele.
//
// efeito 'ativo' (muda o SuperPROC):
//   CopilotMode, EdgeCopilotEnabled, CopilotPageContext, CopilotPageContextEnabled .. o Copilot só recebe conteúdo/abas com os quatro
//                                                                                     ligados (somam-se ao consentimento local);
//   CopilotMultitabEnabled ....................... desligado, só a aba ativa entra na lista de abas enviada ao Copilot;
//   EdgeHistoryAISearchEnabled,
//   ShareBrowsingHistoryWithCopilotSearchAllowed . sem um deles a busca no histórico devolve vazio;
//   GenAILocalFoundationalModelSettings,
//   BuiltInAIAPIsEnabled ......................... resposta às chaves de IA no dispositivo (ligado = 0 = permitido);
//   AllowBrowsingWithCopilot, CopilotCoworkToolActionsEnabled .... liberam o modo agêntico (somam-se à chave agentico);
//   CopilotBrowserUseAllowList/BlockList, BrowsingWithCopilotAllowList/BlockList .... domínios das ações agênticas.
//
// Catálogo em árvore: 4 grupos (os do mapa de decisão do estudo correlacao-politicas-edge-158.md) -> subgrupos -> políticas.
// Metadados por política (para a pessoa decidir e para o Copilot saber): preferências do PrefService, controle de edge://settings,
// chave connected_feature_control, origem (pública ou interna da 158), presença do nome na msedge.dll 158 e política substituta.
// Evidência: nomes de política e de preferência conferidos como string exata na msedge.dll 158.0.4370.33 em 2026-11-21 (busca de bytes);
// o PAR política -> preferência e os controles vêm do estudo (tabelas kSimplePolicyMap/PopulatePolicyHandlerMap), não foram refeitos aqui.
// Os pareamentos de controle são aproximados, salvo 10164 e 830, confirmados no estudo pelo id da string.
const GRUPOS = Object.freeze([
  { id: 'contexto', titulo: 'Contexto do Copilot: leitura de página e abas', descricao: 'O que o Copilot pode ler do que está aberto.' },
  { id: 'presenca', titulo: 'Presença do Copilot: interface, barra lateral, histórico e busca', descricao: 'Onde o Copilot aparece e que dados de navegação ele usa.' },
  { id: 'acoes', titulo: 'Ações do Copilot no navegador (Cowork / Browser Use)', descricao: 'O Copilot agir no navegador: abrir, navegar, rolar.' },
  { id: 'local', titulo: 'IA no dispositivo e recursos inteligentes', descricao: 'Modelo local, escrita, leitura, voz, tradução e proteção.' },
  { id: 'demais', titulo: 'Demais políticas do Edge 158, por categoria', descricao: 'Todas as outras políticas do catálogo do Edge. Só informam o estado ao Copilot; os nomes estão em inglês, como no Edge.' }
]);

// item(nome, tipo, rótulo, extras). extras: efeito ('ativo'), prefs, controle, recurso, interna, ausente, substituta, resposta, nota.
// resposta = como a ponte responde quando a página pede a PREFERÊNCIA pelo nome: 'bool' (padrão de bool), 'lista' (padrão de lista),
// 'int02' (ligado = 0, desligado = 2) ou null (não responde por preferência: formato desconhecido ou resposta fixa da ponte).
const item = (nome, tipo, rotulo, x = {}) => Object.freeze({
  nome, tipo, rotulo, efeito: x.efeito || 'informativo', prefs: Object.freeze(x.prefs || []), controle: x.controle || '', recurso: x.recurso || '',
  origem: x.interna ? 'interna' : 'publica', dll158: !x.ausente, substituta: x.substituta || '', nota: x.nota || '',
  resposta: x.resposta !== undefined ? x.resposta : (tipo === 'bool' ? 'bool' : 'lista')
});
const B = (nome, rotulo, x) => item(nome, 'bool', rotulo, x);
const L = (nome, rotulo, x) => item(nome, 'lista', rotulo, x);
const ATIVO = 'ativo';

const ARVORE = Object.freeze([
  ['contexto', 'Leitura de página', [
    B('CopilotPageContext', 'Copilot pode ler a página e as abas (contas pessoais)', { efeito: ATIVO, prefs: ['edge_underside.sidebar_copilot_consumer_page_context_enabled'], nota: 'Desligado: nenhum conteúdo sai do SuperPROC para o Copilot.' }),
    B('CopilotPageContextEnabled', 'Chave geral do contexto de página', { efeito: ATIVO, interna: true, prefs: ['edge_underside.copilot_page_context_enabled'], nota: 'Desligado: nenhum conteúdo sai do SuperPROC para o Copilot.' }),
    B('EdgeEntraCopilotPageContext', 'Contexto de página para contas corporativas (Entra ID)', { prefs: ['edge_underside.sidebar_copilot_cdp_page_context_enabled'], recurso: 'connected_feature_control.ContextualSummarization', resposta: null, nota: 'A ponte responde sempre falso a esta preferência: com ela verdadeira a página do Copilot troca o caminho de leitura por um que o SuperPROC não oferece.' }),
    B('CopilotOnSensitiveContentEnabled', 'Copilot em páginas marcadas como conteúdo sensível', { interna: true, prefs: ['edge_underside.copilot_on_sensitive_content'] }),
    B('CopilotCDPPageContext', 'Contexto de página com proteção de dados comerciais (legada)', { ausente: true, substituta: 'EdgeEntraCopilotPageContext' })
  ]],
  ['contexto', 'Várias abas e histórico no contexto', [
    B('CopilotMultitabEnabled', 'Copilot enxerga várias abas ao mesmo tempo', { efeito: ATIVO, interna: true, prefs: ['edge_underside.commercial_copilot_context_multitab'], nota: 'Desligado: só a aba ativa entra na lista de abas enviada ao Copilot.' }),
    B('EdgeEntraCopilotPageContextIncludesHistory', 'Contexto do Copilot inclui o histórico de navegação', { interna: true, prefs: ['edge_underside.commercial_copilot_context_includes_history'] })
  ]],
  ['presenca', 'Copilot ligado e botões', [
    B('CopilotMode', 'Modo Copilot ligado', { efeito: ATIVO, interna: true, prefs: ['edge_copilot_mode_enabled2'], nota: 'Interruptor geral na 157 e na 158. Desligado: nenhum conteúdo sai do SuperPROC para o Copilot.' }),
    B('EdgeCopilotEnabled', 'Copilot habilitado (legada)', { efeito: ATIVO, ausente: true, substituta: 'CopilotMode', nota: 'Desligado: nenhum conteúdo sai do SuperPROC para o Copilot.' }),
    B('Microsoft365CopilotChatIconEnabled', 'Botão do Copilot na barra de ferramentas', { prefs: ['browser.show_discover_toolbar_button'], controle: 'CopilotToolbarButtonToggle (477)' }),
    B('M365LinksAutoOpenCopilotEnabled', 'Abrir o Copilot junto com links do Microsoft 365', { prefs: ['edge.m365_links.auto_open_copilot'], controle: 'M365LinksAutoOpenCopilotToggle' })
  ]],
  ['presenca', 'Nova guia e barra de endereços', [
    B('CopilotNewTabPageEnabled', 'Copilot na nova guia (contas Entra)', { prefs: ['edge_copilot_new_tab_page_enabled_aad'] }),
    B('NewTabPageBingChatEnabled', 'Chat do Bing na nova guia (legado)', { prefs: ['ntp.enable_bing_chat_by_policy'] }),
    B('CopilotAddressBarSuggestionsEnabled', 'Sugestões do Copilot na barra de endereços', { prefs: ['edge.copilot_address_bar_suggestions_enabled'] })
  ]],
  ['presenca', 'Histórico e dados de navegação', [
    B('EdgeHistoryAISearchEnabled', 'Busca no histórico com IA', { efeito: ATIVO, prefs: ['edge_history_ai_search_enabled'], nota: 'Desligado: a busca do Copilot no histórico volta vazia.' }),
    B('ShareBrowsingHistoryWithCopilotSearchAllowed', 'Compartilhar o histórico com a busca do Copilot', { efeito: ATIVO, prefs: ['sharecopilotsearch.allowed'], controle: 'M365BrowsingSignalsToggle (64)', nota: 'Desligado: a busca do Copilot no histórico volta vazia.' }),
    B('ShareBrowsingDataWithM365CopilotEnabled', 'Sinais de navegação para o Microsoft 365 Copilot', { interna: true, prefs: ['edge_copilot.browsing_signals.policy_enabled'] }),
    B('BrowserDataImportEnabled', 'Importação contínua de dados para o app do Copilot', { interna: true, prefs: ['copilot_app.continuous_import_enabled'] })
  ]],
  ['presenca', 'Barra lateral', [
    B('HubsSidebarEnabled', 'Barra lateral do Edge', { prefs: ['browser.show_hub_apps_tower'] }),
    B('StandaloneHubsSidebarEnabled', 'Barra lateral independente', { prefs: ['edge_standalone_sidebar.enabled_by_policy'] }),
    B('EdgeOpenInSidebarEnabled', 'Abrir sites na barra lateral', { prefs: ['edge_open_in_sidebar_enabled'] }),
    B('EdgeSidebarCustomizeEnabled', 'Personalizar a barra lateral', { prefs: ['edge_sidebar_customize_enabled'] }),
    B('SearchInSidebarEnabled', 'Pesquisar na barra lateral', { prefs: ['sidebar_search.disable_search_in_sidebar'], resposta: 'int02', nota: 'Política inteira (0 = habilitada, 2 = desabilitada).' }),
    L('EdgeSidebarAppUrlHostAllowList', 'Sites permitidos na barra lateral', { prefs: ['edge_open_in_sidebar_allowed_hosts_list'] }),
    L('EdgeSidebarAppUrlHostBlockList', 'Sites bloqueados na barra lateral', { prefs: ['edge_open_in_sidebar_blocked_hosts_list'] }),
    L('EdgeSidebarAppUrlHostForceList', 'Sites fixados na barra lateral', { prefs: ['edge_open_in_sidebar_forced_hosts_list'] })
  ]],
  ['acoes', 'Permissão para agir', [
    B('CopilotCoworkToolActionsEnabled', 'Permitir que o Copilot use o navegador (Cowork)', { efeito: ATIVO, prefs: ['edge_copilot.cowork.tool_actions_allowed'], controle: 'CoworkToolActionConsentToggle (10164)', nota: 'Desligado: o modo agêntico do SuperPROC fica indisponível. Também depende da permissão “Ações do modo agêntico”.' }),
    B('AllowBrowsingWithCopilot', 'Navegar com o Copilot (motor edge_tools)', { efeito: ATIVO, prefs: ['edge_tools.enabled'], nota: 'Desligado: o modo agêntico do SuperPROC fica indisponível. Também depende da permissão “Ações do modo agêntico”.' })
  ]],
  ['acoes', 'Sites em que o Copilot pode agir', [
    L('CopilotBrowserUseAllowList', 'Sites permitidos (vazio = todos)', { efeito: ATIVO, prefs: ['edge_tools.managed_allow_list_urls'], controle: 'CopilotBrowserAllowedWebsitesLink', nota: 'Preenchida: as ações só valem nos sites listados.' }),
    L('CopilotBrowserUseBlockList', 'Sites bloqueados', { efeito: ATIVO, prefs: ['edge_tools.managed_block_list_urls'], controle: 'CopilotBrowserBlockedWebsitesLink', nota: 'O bloqueio vence a permissão.' }),
    L('BrowsingWithCopilotAllowList', 'Sites permitidos (legada; vazio = todos)', { efeito: ATIVO, ausente: true, substituta: 'CopilotBrowserUseAllowList', nota: 'Vale junto com a lista nova.' }),
    L('BrowsingWithCopilotBlockList', 'Sites bloqueados (legada)', { efeito: ATIVO, ausente: true, substituta: 'CopilotBrowserUseBlockList', nota: 'Vale junto com a lista nova.' })
  ]],
  ['acoes', 'Aba de código do Copilot (sandbox)', [
    B('CopilotDeviceCodeTabOutboundNetworkAccess', 'Acesso de rede de saída', { interna: true, prefs: ['edge_copilot.device_code_tab_outbound_network_access_enabled'] }),
    B('CopilotDeviceCodeTabOutboundNetworkAccessMode', 'Modo do acesso de rede de saída', { interna: true, prefs: ['edge_copilot.device_code_tab_outbound_network_access_mode'], resposta: null, nota: 'Os valores do modo não foram mapeados: o SuperPROC guarda só ligado/desligado e não responde por esta preferência.' }),
    L('CopilotDeviceCodeTabOutboundNetworkAllowedHosts', 'Hosts de saída permitidos (vazio = sem restrição)', { interna: true, prefs: ['edge_copilot.device_code_tab_outbound_network_allowed_hosts'], resposta: null, nota: 'Política de texto no Edge; o formato não foi mapeado e a ponte não responde por esta preferência.' }),
    B('CopilotDeviceCodeTabPreInstall', 'Pré-instalação', { interna: true, prefs: ['edge_copilot.device_code_tab_pre_install_enabled'] }),
    B('CopilotDeviceCodeTabSandbox', 'Modo protegido (sandbox)', { interna: true, prefs: ['edge_copilot.device_code_tab_protected_mode_enabled'] })
  ]],
  ['local', 'IA no dispositivo', [
    B('GenAILocalFoundationalModelSettings', 'Modelo local permitido (0 = permitido)', { efeito: ATIVO, prefs: ['optimization_guide.gen_ai_local_foundational_model_settings', 'optimization_guide.on_device_foundational_model_user_settings'], controle: '“IA no dispositivo” (830)', resposta: null, nota: 'Também depende da caixa “Permitir IA no dispositivo” e de BuiltInAIAPIsEnabled.' }),
    B('BuiltInAIAPIsEnabled', 'APIs de IA embutidas (LanguageModel, Prompt API)', { efeito: ATIVO, prefs: ['policy.built_in_ai_apis_enabled'], resposta: null, nota: 'Também depende da caixa “Permitir IA no dispositivo” e de GenAILocalFoundationalModelSettings.' }),
    B('DevToolsGenAiSettings', 'Assistentes de IA no DevTools', { interna: true, prefs: ['devtools.gen_ai_settings'], resposta: 'int02', nota: 'Política inteira (0 = habilitada, 2 = desabilitada).' })
  ]],
  ['local', 'Escrita', [
    B('ComposeInlineEnabled', 'Assistência de escrita nos campos de texto', { prefs: ['edge.compose_inline_enabled'], controle: 'EditorSpellcheckSectionRenderComposeInlineToggle (313)' }),
    B('TextPredictionEnabled', 'Previsão de texto', { prefs: ['browser.enable_text_prediction_v2'], recurso: 'connected_feature_control.TextPrediction' }),
    B('MicrosoftEditorProofingEnabled', 'Revisão do Microsoft Editor', { prefs: ['browser.enable_editor_proofing'], recurso: 'connected_feature_control.EditorProofing' }),
    B('MicrosoftEditorSynonymsEnabled', 'Sinônimos do Microsoft Editor', { prefs: ['browser.enable_editor_synonyms'], recurso: 'connected_feature_control.EditorSynonyms' })
  ]],
  ['local', 'Leitura, voz e tradução', [
    B('EdgeReadingModeServiceBasedExtractionEnabled', 'Modo de leitura com extração pelo serviço', { prefs: ['reading_view.service_based_extraction'], recurso: 'connected_feature_control.ReadingModeServiceBasedExtraction' }),
    B('ReadAloudEnabled', 'Ler em voz alta', { prefs: ['read_aloud.enabled_by_policy'], recurso: 'connected_feature_control.ReadAloud' }),
    B('SpeechRecognitionEnabled', 'Reconhecimento de fala', { prefs: ['speech_recognition.enabled'], recurso: 'connected_feature_control.SpeechRecognition' }),
    B('TranslateEnabled', 'Tradução', { prefs: ['translate.enabled'], recurso: 'connected_feature_control.Translate' }),
    B('LiveVideoTranslationEnabled', 'Tradução de vídeo ao vivo', { prefs: ['edge.video_translate.live_video_translation_enabled'], controle: 'OfferToEnableVideoTranslateToggle' }),
    B('AccessibilityImageLabelsEnabled', 'Descrição de imagens para leitores de tela', { prefs: ['settings.a11y.enable_accessibility_image_labels'], controle: 'AccessibilityUsabilityImageDescriptionToggle', recurso: 'connected_feature_control.ImageDescription' }),
    B('VisualSearchEnabled', 'Pesquisa visual', { prefs: ['visual_search.policy_enabled', 'visual_search.enabled'], recurso: 'connected_feature_control.VisualSearch' }),
    L('SmartActionsBlockList', 'Ações inteligentes bloqueadas (vazio = nenhuma)', { prefs: ['edge_quick_search.smart_action_block_list'] })
  ]],
  ['local', 'Abas, temas e preenchimento', [
    B('TabServicesEnabled', 'Organização inteligente de abas', { prefs: ['edge_tab_services_enabled'], recurso: 'connected_feature_control.EdgeTabServices' }),
    B('AIGenThemesEnabled', 'Temas gerados por IA', { prefs: ['edge.ai_gen_themes_enabled'] }),
    B('EdgeAutofillMlEnabled', 'Preenchimento automático com aprendizado de máquina', { prefs: ['autofill.edge_autofill_advanced_ml_enabled'], recurso: 'connected_feature_control.AutofillMLSuggestions' })
  ]],
  ['local', 'Bloqueador de scareware', [
    B('ScarewareBlockerProtectionEnabled', 'Bloqueador de scareware ligado', { prefs: ['edge.techscam_detection.enabled'] }),
    B('ScarewareBlockerBlocksDetectedSitesEnabled', 'Bloquear os sites detectados como golpe', { prefs: ['edge.techscam_detection.blocking.enabled'], controle: 'TechScamDetectionBlockSitesToggle (436)' }),
    B('ScarewareBlockerSendDetectedSitesToSmartScreenEnabled', 'Enviar os sites detectados ao SmartScreen', { prefs: ['edge.techscam_detection.smart_screen.enabled'], controle: 'TechScamDetectionSendToSmartScreenToggle (112)' }),
    L('ScarewareBlockerAllowListDomains', 'Domínios isentos do bloqueador', { prefs: ['edge.techscam_detection.allow_list_domains'] })
  ]]
]);

const TITULO_DO_GRUPO = new Map(GRUPOS.map((g) => [g.id, g.titulo]));

// ---- as demais políticas do Edge 158 (dado gerado por scripts/gerar-politicas-edge-158.cjs a partir do estudo) ---------------------
// Entram TODAS as políticas do estudo que não estão na árvore curada acima, no grupo 'demais', um subgrupo por categoria do catálogo
// do Edge. São só informativas: o SuperPROC guarda ligado/desligado (ou uma lista, quando a política é LIST no Edge), o Copilot as
// consulta pela ferramenta superproc_get_ai_policies, e a ponte NÃO responde por elas em prefs.get (nem pelo nome da política nem pelo
// da preferência): várias têm sentido restritivo (Disable..., Block..., Force...) ou tipo inteiro/texto, e responder "verdadeiro" às
// cegas poderia mudar o comportamento da página do Copilot para o lado errado. O rótulo é o nome da política separado em palavras.
const DADOS = require('./politicas-edge-158.json');
const CATEGORIAS = Object.freeze({
  'Accessibility': 'Acessibilidade', 'Address Bar': 'Barra de endereços', 'Application Guard settings': 'Application Guard', 'Cast': 'Transmissão (Cast)',
  'Certificate management settings': 'Gerenciamento de certificados', 'Connector': 'Conectores', 'Content settings': 'Configurações de conteúdo', 'Copilot': 'Copilot',
  'Cryptography compliance policies': 'Conformidade de criptografia', 'Default search provider': 'Provedor de pesquisa padrão', 'Diagnostic Data': 'Dados de diagnóstico',
  'Downloads': 'Downloads', 'Edge Website Typo Protection settings': 'Proteção contra erros de digitação em sites', 'Edge Workspaces settings': 'Edge Workspaces',
  'Enhanced Security Mode': 'Modo de segurança aprimorado', 'Experimentation': 'Experimentação', 'Extensions': 'Extensões', 'Games settings': 'Jogos',
  'Generative AI': 'IA generativa', 'HTTP authentication': 'Autenticação HTTP', 'Identity and sign-in': 'Identidade e entrada', 'Idle Browser Actions': 'Ações com o navegador ocioso',
  'Immersive Reader settings': 'Leitura avançada', 'Import': 'Importação', 'Internet Explorer Mode': 'Modo Internet Explorer', 'Kiosk Mode settings': 'Modo quiosque',
  'Manageability': 'Gerenciamento', 'Microsoft Office': 'Microsoft Office', 'Native Messaging': 'Mensagens nativas', 'Network settings': 'Rede', 'PDF Reader': 'Leitor de PDF',
  'Password manager and protection': 'Gerenciador e proteção de senhas', 'Performance': 'Desempenho', 'Permit or deny screen capture': 'Captura de tela: permitir ou negar',
  'Personalization': 'Personalização', 'Printing': 'Impressão', 'Private Network Request Settings': 'Requisições à rede privada', 'Profile settings': 'Perfis',
  'Protected Content': 'Conteúdo protegido', 'Proxy server': 'Servidor proxy', 'Related Website Sets Settings': 'Conjuntos de sites relacionados', 'Relaunch': 'Reinício',
  'Remix settings': 'Remix', 'Scareware Blocker settings': 'Bloqueador de scareware', 'Sleeping tabs settings': 'Abas em suspensão', 'SmartScreen settings': 'SmartScreen',
  'Startup, home page and new tab page': 'Inicialização, página inicial e nova guia', 'WebRtc settings': 'WebRTC', 'Additional': 'Outras (sem categoria no catálogo do Edge)',
  'Políticas Internas Extras de IA/Copilot presentes na DLL 158': 'Internas da 158 (outras)'
});
// "HTTPSUpgradesEnabled" -> "HTTPS upgrades enabled"
function rotuloDoNome(nome) {
  const partes = nome.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g) || [nome];
  return partes.map((p, i) => (p.length > 1 && p === p.toUpperCase() ? p : (i === 0 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()))).join(' ');
}
// Políticas RESTRITIVAS: ligadas, elas tiram, bloqueiam ou apagam algo do navegador (e, por tabela, do que o Copilot/IA pode ver ou
// fazer nele) ou forçam um modo restrito. Vêm DESLIGADAS por padrão (decisão do responsável, 2026-11-21): no SuperPROC o Copilot recebe
// autorização para tudo, então "tudo liberado" significa estas desligadas e as demais ligadas. Lista explícita, escolhida pelo NOME da
// política (o estudo não traz descrição): Disable/Disabled, Block/Blocked/Blocklist, Restrict, Prevent, Enforced/Only, modo quiosque ou
// bloqueado, apagar dados ao sair, tempo ocioso, pesquisa segura forçada, e AlwaysOpenPdfExternally (o PDF sai do navegador e o Copilot
// não o lê). Ficaram de FORA, ligadas como as outras: as que só escondem interface ou avisos (Hide..., Suppress..., ...Warnings...), as
// de endurecimento sem efeito sobre o uso (sandbox, isolamento, verificações estritas), as que forçam um recurso a ficar LIGADO
// (ForceSync, ...ForceList) e as que afrouxam algo apesar do nome (Exempt..., ...Bypass..., ...EnforcementDisabledFor...).
const RESTRITIVAS = new Set([
  'ApplicationGuardUploadBlockingEnabled', 'EdgeDisableDialProtocolForCastDiscovery', 'EdgeFileUploadBlockedForUrls', 'PluginsBlockedForUrls',
  'ThirdPartyStoragePartitioningBlockedForOrigins', 'WindowManagementBlockedForUrls', 'DownloadBlockedForFileTypes', 'DownloadRestrictions',
  'PreventTyposquattingPromptOverride', 'BlockExternalExtensions', 'ExtensionInstallBlocklist', 'DisableAuthNegotiateCnameLookup', 'EdgeBlockSignInEnabled',
  'OneAuthAuthenticationEnforced', 'OnlyOnPremisesImplicitSigninEnabled', 'IdleTimeout', 'IdleTimeoutActions', 'ImportPasswordsDisabled',
  'InternetExplorerModeClearDataOnExitEnabled', 'EdgeEnableKioskMode', 'KioskDeleteDownloadsOnExit', 'EdgeAllowedAccountOnly', 'NativeMessagingBlocklist',
  'BlockTruncatedCookies', 'LocalNetworkAccessRestrictionsEnabled', 'PrivateNetworkAccessRestrictionsEnabled', 'PasswordDeleteOnBrowserCloseEnabled',
  'PasswordManagerRestrictLengthEnabled', 'DisableScreenshots', 'RemixDomainBlocklist', 'PreventSmartScreenPromptOverride', 'PreventSmartScreenPromptOverrideForFiles',
  'BlockThirdPartyCookies', 'BrowserGuestModeEnforced', 'BrowserLegacyExtensionPointsBlockingEnabled', 'ClearBrowsingDataOnExit', 'ClearCachedImagesAndFilesOnExit',
  'CollectionsServicesAndExportsBlockList', 'DeleteDataOnMigration', 'DeveloperToolsAvailabilityBlocklist', 'Disable3DAPIs', 'DisabledMiniApps', 'EdgeDisableShareUsageData',
  'EdgeLockedViewModeEnabled', 'ForceBingSafeSearch', 'ForceGoogleSafeSearch', 'ForceYouTubeRestrict', 'ForceEphemeralProfiles', 'ForceBrowserSignin', 'HttpsOnlyMode',
  'InPrivateModeUrlBlocklist', 'RedirectSitesFromInternetExplorerPreventBHOInstall', 'RestrictBackgroundFetchFromServiceWorkerEnabled', 'RestrictCoreSharingOnRenderer',
  'RestrictSigninToPattern', 'SandboxExternalProtocolBlocked', 'SavingBrowserHistoryDisabled', 'SpellcheckLanguageBlocklist', 'SyncDisabled', 'SyncTypesListDisabled',
  'URLBlocklist', 'WebContentFilteringBlockedCategories', 'AlwaysOpenPdfExternally'
]);
const DADO_POR_NOME = new Map(DADOS.politicas.map((d) => [d.nome, d]));
const CURADAS = ARVORE.flatMap(([grupoId, sub, itens]) => itens.map((p) => Object.freeze({ ...p, grupoId, grupo: TITULO_DO_GRUPO.get(grupoId), sub, curada: true, restritiva: false, tipoEdge: (DADO_POR_NOME.get(p.nome) || {}).tipo || '' })));
const NOMES_CURADOS = new Set(CURADAS.map((p) => p.nome));
const GERADAS = DADOS.politicas.filter((d) => !NOMES_CURADOS.has(d.nome)).map((d) => Object.freeze({
  nome: d.nome, tipo: d.tipo === 'LIST' ? 'lista' : 'bool', rotulo: rotuloDoNome(d.nome), efeito: 'informativo',
  prefs: Object.freeze(d.prefs.filter((k) => !(d.prefsForaDaDll || []).includes(k))), controle: d.controle, recurso: d.recurso,
  origem: d.interna ? 'interna' : 'publica', dll158: d.naDll === true, substituta: '', nota: '', resposta: null,
  grupoId: 'demais', grupo: TITULO_DO_GRUPO.get('demais'), sub: CATEGORIAS[d.categoria] || d.categoria, curada: false, tipoEdge: d.tipo || '',
  restritiva: d.tipo !== 'LIST' && RESTRITIVAS.has(d.nome)
}));
const CATALOGO = Object.freeze([...CURADAS, ...GERADAS]);
const POR_NOME = new Map(CATALOGO.map((p) => [p.nome, p]));
const MAX_ITENS_LISTA = 50;
const MAX_TAMANHO_ITEM = 200;
const MAX_LOTE = 1000;

// Padrão: caixa ligada, salvo as restritivas (desligadas); lista vazia.
const PADROES = Object.freeze(Object.fromEntries(CATALOGO.map((p) => [p.nome, p.tipo === 'bool' ? !p.restritiva : Object.freeze([])])));
const padroes = () => { const o = { ...PADROES }; for (const p of CATALOGO) if (p.tipo !== 'bool') o[p.nome] = []; return o; };

// Valida um valor para o item: bool para 'bool'; lista de textos curtos, sem duplicados, para 'lista'. Devolve o valor limpo ou lança.
function validar(nome, valor) {
  const def = POR_NOME.get(nome);
  if (!def) throw Error('Política desconhecida.');
  if (def.tipo === 'bool') { if (typeof valor !== 'boolean') throw Error('Valor inválido.'); return valor; }
  if (!Array.isArray(valor)) throw Error('Valor inválido.');
  const limpos = [];
  for (const v of valor) {
    if (typeof v !== 'string') throw Error('Valor inválido.');
    const t = v.trim();
    if (!t) continue;
    if (t.length > MAX_TAMANHO_ITEM || /[\s\u0000-\u001f]/.test(t)) throw Error('Item inválido.');
    if (!limpos.includes(t)) limpos.push(t);
  }
  if (limpos.length > MAX_ITENS_LISTA) throw Error('Itens demais.');
  return limpos;
}

// Junta o que está salvo com os padrões; o que for inválido ou desconhecido é ignorado (nunca derruba a leitura).
function resolver(salvo) {
  const base = padroes();
  if (!salvo || typeof salvo !== 'object' || Array.isArray(salvo)) return base;
  for (const nome of Object.keys(salvo)) {
    if (!POR_NOME.has(nome)) continue;
    try { base[nome] = validar(nome, salvo[nome]); } catch (_) { /* fica o padrão */ }
  }
  return base;
}

// O que vai para o arquivo de configuração: só o que difere do padrão (caixa em estado diferente do padrão ou lista preenchida).
function compactar(valores) {
  const fora = {};
  for (const p of CATALOGO) { const v = valores[p.nome]; if (p.tipo === 'bool' ? (typeof v === 'boolean' && v !== PADROES[p.nome]) : (Array.isArray(v) && v.length > 0)) fora[p.nome] = v; }
  return fora;
}

// Liga ou desliga várias caixas de uma vez (a caixa de um ramo da árvore). Só nomes de políticas de caixa; devolve os valores novos.
function aplicarLote(valores, nomes, valor) {
  if (!Array.isArray(nomes) || nomes.length < 1 || nomes.length > MAX_LOTE || typeof valor !== 'boolean') throw Error('Lote inválido.');
  for (const n of nomes) { const def = typeof n === 'string' ? POR_NOME.get(n) : null; if (!def || def.tipo !== 'bool') throw Error('Lote inválido.'); }
  const novo = { ...valores };
  for (const n of nomes) novo[n] = valor;
  return novo;
}

// Estado e metadados de uma política, para o Copilot e para o CFG.
const descreverUma = (p, valores) => ({
  name: p.nome, groupId: p.grupoId, group: p.grupo, subgroup: p.sub, type: p.tipo, label: p.rotulo, effect: p.efeito, value: valores[p.nome],
  prefs: [...p.prefs], control: p.controle, feature: p.recurso, origin: p.origem, inEdge158: p.dll158, replacedBy: p.substituta, note: p.nota,
  curated: p.curada, edgeType: p.tipoEdge, restrictive: p.restritiva, default: p.tipo === 'bool' ? PADROES[p.nome] : []
});
// Todas, na ordem da árvore (é o que o CFG recebe).
const descrever = (valores) => CATALOGO.map((p) => descreverUma(p, valores));
const grupos = () => GRUPOS.map((g) => ({ id: g.id, title: g.titulo, description: g.descricao }));

// Consulta da ferramenta superproc_get_ai_policies. Sem argumentos: as curadas de IA/Copilot inteiras e, das demais, só o resumo
// (total, quais estão desligadas, quais listas estão preenchidas), para a resposta não passar de alguns KiB. Com query, groupId ou
// changedOnly: as que casam, em qualquer grupo, até limit (padrão 50, máximo 100).
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const alterada = (p, valores) => (p.tipo === 'bool' ? valores[p.nome] !== PADROES[p.nome] : (valores[p.nome] || []).length > 0);
function consultar(valores, args = {}) {
  const a = args && typeof args === 'object' ? args : {};
  const filtrado = typeof a.query === 'string' || typeof a.groupId === 'string' || a.changedOnly === true;
  const demais = GERADAS;
  // restrictive = quantas são restritivas (vêm desligadas); changed = caixas fora do padrão (permissiva desligada ou restritiva ligada)
  const resumo = { total: demais.length, restrictive: demais.filter((p) => p.restritiva).length, changed: demais.filter((p) => p.tipo === 'bool' && valores[p.nome] !== PADROES[p.nome]).map((p) => p.nome), filledLists: demais.filter((p) => p.tipo !== 'bool' && (valores[p.nome] || []).length > 0).map((p) => p.nome) };
  if (!filtrado) return { policies: CURADAS.map((p) => descreverUma(p, valores)), total: CATALOGO.length, others: { ...resumo, hint: 'Use query, groupId ("demais") ou changedOnly para consultar as demais políticas.' } };
  const termo = typeof a.query === 'string' ? semAcento(a.query.trim()) : '';
  const limite = Number.isInteger(a.limit) && a.limit >= 1 && a.limit <= 100 ? a.limit : 50;
  const casam = CATALOGO.filter((p) => (typeof a.groupId !== 'string' || p.grupoId === a.groupId) && (a.changedOnly !== true || alterada(p, valores))
    && (!termo || semAcento([p.nome, p.rotulo, p.sub, p.controle, p.recurso, ...p.prefs].join(' ')).includes(termo)));
  return { policies: casam.slice(0, limite).map((p) => descreverUma(p, valores)), total: CATALOGO.length, matched: casam.length, truncated: casam.length > limite };
}

// "EdgeCopilotEnabled", "policy.edge_copilot_enabled", "policy.EdgeCopilotEnabled" -> 'EdgeCopilotEnabled' (ou null).
// Só as curadas: a ponte não responde em prefs.get pelas demais (ver o comentário do grupo 'demais').
const NORM = new Map(CURADAS.map((p) => [p.nome.toLowerCase(), p.nome]));
function nomeDaChave(chave) {
  if (typeof chave !== 'string' || chave.length > 120) return null;
  const limpo = chave.replace(/^policy\./i, '').replace(/[._-]/g, '').toLowerCase();
  return NORM.get(limpo) || null;
}

// Resposta quando a página pede a PREFERÊNCIA do Edge ligada a uma política (nome exato da preferência). Tipos HIPÓTESE: bool ->
// boolValue; lista -> stringValue (JSON); 'int02' -> intValue 0 (ligado) ou 2 (desligado). Sem resposta definida -> undefined.
const POR_PREF = new Map();
for (const p of CATALOGO) if (p.resposta) for (const k of p.prefs) if (!POR_PREF.has(k)) POR_PREF.set(k, p);
function responderPref(chave, valores) {
  const p = typeof chave === 'string' ? POR_PREF.get(chave) : null;
  if (!p) return undefined;
  const v = valores[p.nome];
  if (p.resposta === 'int02') return { intValue: v === true ? 0 : 2 };
  return p.tipo === 'bool' ? { boolValue: v === true } : { stringValue: JSON.stringify(Array.isArray(v) ? v : []) };
}

// Padrões aceitos: "exemplo.jus.br" (o host e subdomínios), "*.jus.br", "https://exemplo.jus.br" (host e esquema), "[*.]jus.br".
function casaPadrao(url, padrao) {
  let u; try { u = new URL(url); } catch { return false; }
  let p = String(padrao).trim().toLowerCase();
  if (!p || p === '*') return p === '*';
  let esquema = null;
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/.exec(p);
  if (m) { esquema = m[1]; p = m[2]; }
  p = p.replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (esquema && u.protocol !== esquema + ':') return false;
  const host = u.hostname.toLowerCase();
  p = p.replace(/^\[\*\.\]/, '*.');
  if (p.startsWith('*.')) { const raiz = p.slice(2); return host === raiz || host.endsWith('.' + raiz); }
  return host === p || host.endsWith('.' + p);
}
const casaAlgum = (url, lista) => (Array.isArray(lista) ? lista : []).some((p) => casaPadrao(url, p));

// Decide se uma ação agêntica pode tocar nesse endereço: bloqueio ganha de tudo; listas de permissão preenchidas exigem casar.
function enderecoPermitido(url, { permitidos = [], bloqueados = [] } = {}) {
  if (casaAlgum(url, bloqueados)) return false;
  return !permitidos.length || casaAlgum(url, permitidos);
}

module.exports = { RESTRITIVAS, CATALOGO, CURADAS, GRUPOS, grupos, responderPref, compactar, aplicarLote, consultar, rotuloDoNome, MAX_LOTE, padroes, validar, resolver, descrever, nomeDaChave, casaPadrao, enderecoPermitido, MAX_ITENS_LISTA };
