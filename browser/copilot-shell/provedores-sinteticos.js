'use strict';
// Provedores SINTÉTICOS e o provedor "sem integração documentada". Nada aqui contata a Microsoft, usa conta real,
// client ID de terceiros, cookies ou tokens. O estado sintético não indica licença nem elegibilidade de conta alguma.

const CENARIOS = Object.freeze(['acesso', 'pronto', 'indisponivel', 'falha']);

// account sintética: o cenário define o estado inicial; entrar() só tem efeito no cenário 'acesso'.
function criarContaSintetica({ cenario = 'acesso' } = {}) {
  let sessao = cenario !== 'acesso';
  return {
    async obterEstado() {
      if (cenario === 'falha') return { status: 'erro', motivo: 'FALHA_SINTETICA' };
      return { status: sessao ? 'autenticada' : 'sem-sessao' };
    },
    async entrar() { sessao = true; return { status: 'autenticada' }; }
  };
}

function criarElegibilidadeSintetica({ cenario = 'acesso' } = {}) {
  return {
    async avaliar() {
      return cenario === 'indisponivel' ? { estado: 'indisponivel', motivo: 'INDISPONIVEL_SINTETICO' } : { estado: 'suportada' };
    }
  };
}

// Modo não sintético: não existe integração documentada e suportada para hospedar o Copilot comercial no SuperPROC.
function criarContaNaoConfigurada() {
  return { async obterEstado() { return { status: 'desconhecida' }; }, async entrar() { return { status: 'desconhecida' }; } };
}
function criarElegibilidadeIndisponivel() {
  return { async avaliar() { return { estado: 'indisponivel', motivo: 'SEM_INTEGRACAO_DOCUMENTADA' }; } };
}

// consumer sintético: demonstra o uso do browserContext. Só age quando o usuário aciona uma demonstração na página do
// shell; nada é colado, enviado ou lido automaticamente. O canal é um segredo do processo principal, revogado ao desmontar.
function criarConsumidorSintetico({ gerarCanal = () => require('node:crypto').randomBytes(16).toString('hex') } = {}) {
  let estado = 'desmontado';
  let ctx = null;
  let canal = null;
  return {
    estado: () => estado,
    async montar({ browserContext, registrarCanal }) {
      estado = 'montando';
      if (!browserContext || typeof browserContext.listarAbas !== 'function') { estado = 'erro'; throw Object.assign(Error('contexto'), { codigo: 'CONTEXTO_AUSENTE' }); }
      ctx = browserContext;
      canal = gerarCanal();
      registrarCanal(canal);
      estado = 'montado';
    },
    async desmontar() { ctx = null; canal = null; estado = 'desmontado'; },
    // Demonstrações: devolvem o resultado estruturado do browserContext.
    async listarAbas() { return ctx ? ctx.listarAbas({ canal }) : { ok: false, erro: { codigo: 'CONSUMIDOR_DESMONTADO', retentavel: false } }; },
    async lerAba(tabId, maxCaracteres) { return ctx ? ctx.lerAba({ canal, tabId, maxCaracteres }) : { ok: false, erro: { codigo: 'CONSUMIDOR_DESMONTADO', retentavel: false } }; },
    // Só para testes: devolve o canal vigente (nunca exposto por IPC).
    _canalParaTeste: () => canal
  };
}

module.exports = { CENARIOS, criarContaSintetica, criarElegibilidadeSintetica, criarContaNaoConfigurada, criarElegibilidadeIndisponivel, criarConsumidorSintetico };
