'use strict';
/**
 * Conferência diária: na PRIMEIRA abertura da Legislação em cada dia (data de America/Sao_Paulo) o app
 * tenta atualizar; se já tentou hoje (com sucesso ou não), usa só o cache até o dia seguinte.
 *
 * A data é gravada ANTES de tentar: falha, bloqueio, fechamento do painel ou queda do app no meio
 * não geram nova tentativa no mesmo dia. Escopo: (1) catálogo — normas dos dois últimos anos;
 * (2) biblioteca — só as normas que o usuário baixou (o texto só é rebaixado se a versão mudou).
 */
const fs = require('node:fs');
const path = require('node:path');
const { ErroFonteBloqueada } = require('./fonte');
const { FAMILIAS_RECENTES } = require('./tipos');
const { hojeSaoPaulo } = require('./biblioteca');

function criarConferencia({ arquivo, biblioteca, catalogo, fonte, hoje = () => hojeSaoPaulo(), agora = () => new Date() }) {
  let rodando = null;

  function estado() {
    try {
      const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      return j && typeof j === 'object' ? j : {};
    } catch { return {}; }
  }
  function salvar(e) {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    const tmp = arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(e, null, 1));
    fs.renameSync(tmp, arquivo);
  }

  async function executar(dia) {
    const r = { status: 'concluida', bloqueada: false, catalogo: { novas: 0, erro: null }, normas: { conferidas: 0, atualizadas: 0, inalteradas: 0, mantidas: 0, falhas: 0 } };
    const ano = Number(dia.slice(0, 4));
    try {
      try {
        for (const familia of FAMILIAS_RECENTES) {
          for (const a of [ano, ano - 1]) r.catalogo.novas += catalogo.mesclar(await fonte.listarFamilia(familia, a));
        }
      } catch (e) {
        if (e instanceof ErroFonteBloqueada) throw e;
        r.catalogo.erro = e.message;
      }
      for (const norma of biblioteca.listar()) {
        try {
          const x = await biblioteca.conferir(norma.slug);
          r.normas.conferidas++;
          if (x.status === 'atualizada') r.normas.atualizadas++;
          else if (x.status === 'inalterada') r.normas.inalteradas++;
          else if (x.status === 'mantida') r.normas.mantidas++;
          else r.normas.falhas++;
        } catch (e) {
          if (e instanceof ErroFonteBloqueada) throw e;
          r.normas.falhas++;
        }
      }
    } catch (e) {
      if (e instanceof ErroFonteBloqueada) { r.status = 'bloqueada'; r.bloqueada = true; r.erro = e.message; }
      else { r.status = 'falhou'; r.erro = e.message; }
    }
    return r;
  }

  return {
    estado,
    /** Já houve tentativa hoje? */
    jaTentouHoje: () => estado().ultima_data === hoje(),
    /**
     * Tenta a conferência do dia, se for a primeira. `forcar` existe só para ação manual explícita do usuário.
     * @returns {Promise<{executou:boolean, motivo?:string, resultado?:object}>}
     */
    tentarHoje({ forcar = false } = {}) {
      if (rodando) return rodando.then(() => ({ executou: false, motivo: 'em-andamento' }));
      const dia = hoje();
      if (!forcar && estado().ultima_data === dia) return Promise.resolve({ executou: false, motivo: 'ja-tentado-hoje' });
      const ultimoSucesso = estado().ultimo_sucesso || null;
      const iniciadaEm = agora().toISOString();
      // A data entra no arquivo ANTES de tentar (e o último sucesso anterior é preservado).
      salvar({ ultima_data: dia, iniciada_em: iniciadaEm, ultimo_sucesso: ultimoSucesso, resultado: { status: 'em-andamento' } });
      rodando = (async () => {
        const resultado = await executar(dia);
        salvar({ ultima_data: dia, iniciada_em: iniciadaEm, concluida_em: agora().toISOString(), resultado, ultimo_sucesso: resultado.status === 'concluida' ? dia : ultimoSucesso });
        return resultado;
      })();
      return rodando.then(resultado => { rodando = null; return { executou: true, resultado }; }, e => { rodando = null; throw e; });
    }
  };
}

module.exports = { criarConferencia };
