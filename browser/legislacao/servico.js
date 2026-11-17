'use strict';
/**
 * Fachada da legislação local: junta catálogo (pesquisa), biblioteca (normas baixadas), conferência
 * diária e o vínculo com o acesso rápido. O `config` injetado (config-manager) é quem grava os itens.
 */
const path = require('node:path');
const { criarFonte } = require('./fonte');
const { criarCatalogo, nomeParaAcessoRapido, norm, analisarConsulta } = require('./catalogo');
const { criarBiblioteca, hojeSaoPaulo } = require('./biblioteca');
const { criarConferencia } = require('./conferencia');
const { reconhecerEntrada } = require('./entrada');
const { TIPOS, numeroFormatado, ANO_INICIAL_DECRETOS } = require('./tipos');
const { SCHEME, criarManipulador } = require('./visualizador');

const urlDaNorma = (slug) => `${SCHEME}://norma/${slug}`;
const URL_CATALOGO = `${SCHEME}://catalogo/`;
const BAIXADO_OK = new Set(['ok', 'atualizada', 'inalterada', 'mantida']);

function criarServico({ dirDados, snapshot, config, fonte = criarFonte(), hoje = () => hojeSaoPaulo(), aoAlterarConfig = () => {}, bibliotecaInicial = null }) {
  const catalogo = criarCatalogo({ snapshot, delta: path.join(dirDados, 'catalogo-delta.json') });
  const biblioteca = criarBiblioteca({ dir: path.join(dirDados, 'biblioteca'), fonte, hoje });
  if (bibliotecaInicial) biblioteca.semear(bibliotecaInicial); // normas que já acompanham o aplicativo
  const conferencia = criarConferencia({ arquivo: path.join(dirDados, 'conferencia.json'), biblioteca, catalogo, fonte, hoje });

  function dtos(entradas) {
    const baixadas = new Map(biblioteca.listar().map(r => [r.urn, r]));
    const fixadas = config.normasFixadas();
    return entradas.filter(Boolean).map(x => ({
      urn: x.u, slug: x.s, titulo: x.t, tipo: TIPOS[x.k] ? TIPOS[x.k][4] : x.k, numero: numeroFormatado(x.n), data: x.d,
      ementa: x.e, apelidos: x.a || [], nomeSugerido: nomeParaAcessoRapido(x),
      baixada: baixadas.has(x.u), fixada: fixadas.has(x.u), conferidoEm: baixadas.get(x.u)?.conferido_em || null
    }));
  }

  /** Pesquisa no catálogo. NÃO baixa nada e NÃO mexe no acesso rápido. */
  function buscar(texto) {
    const rec = reconhecerEntrada(texto);
    if (rec) {
      const achados = rec.urn ? [catalogo.obter(rec.urn)] : catalogo.buscar(rec.consulta, { limite: 10 });
      const resultados = dtos(achados);
      if (resultados.length) return { reconhecido: rec.origem, resultados };
    }
    return { reconhecido: null, resultados: dtos(catalogo.buscar(texto)) };
  }

  /**
   * Pesquisa com um recurso a mais: decreto pedido por número e ano que o catálogo embutido não cobre (anteriores a
   * ANO_INICIAL_DECRETOS) é procurado na lista oficial daquele ano, que passa a fazer parte do catálogo local.
   * Só acontece quando a pesquisa não achou nada e pediu exatamente isso; nunca baixa o texto.
   */
  async function buscarComRede(texto) {
    const r = buscar(texto);
    if (r.resultados.length || r.reconhecido === 'urn' || r.reconhecido === 'normas.leg.br') return r;
    const rec = reconhecerEntrada(texto);
    const consulta = rec && rec.consulta ? rec.consulta : texto;
    const q = analisarConsulta(consulta);
    if (!(q.familias && q.familias.length === 1 && q.familias[0] === 'DEC' && q.numero)) return r;
    // Anos possíveis: "/1932", "/32" (27 a 99 = 19xx; 00 a 26 vale 20xx e também 19xx) ou "20910 1932" (ano solto, sem barra).
    const anos = new Set();
    if (q.ano) {
      anos.add(q.ano);
      const dois = /[/\-]\s*(\d{2})(?!\d)/.exec(consulta);
      if (dois && q.ano >= 2000) anos.add(1900 + Number(dois[1]));
    } else {
      for (const p of q.palavras) if (/^(18|19|20)\d\d$/.test(p)) anos.add(Number(p));
    }
    const antigos = [...anos].filter(a => a < ANO_INICIAL_DECRETOS);
    if (!antigos.length) return r;
    try {
      let novos = 0;
      for (const ano of antigos) novos += catalogo.mesclar(await fonte.listarFamilia('DEC', ano));
      if (novos) {
        // Procura de novo com cada ano explícito (o texto original pode ter o ano de dois dígitos ambíguo).
        for (const ano of antigos) {
          const achou = buscar(`decreto ${q.numero}/${ano}`);
          if (achou.resultados.length) return achou;
        }
      }
    } catch (e) {
      return { ...r, aviso: 'Não foi possível consultar a fonte oficial agora. Verifique a conexão e tente de novo.' };
    }
    return r;
  }

  /** Normas já baixadas (biblioteca local), para ler sem pesquisar. Mais recentes primeiro. */
  function minhaBiblioteca() {
    const regs = biblioteca.listar().sort((a, b) => String(b.baixado_em).localeCompare(String(a.baixado_em)) || String(a.titulo).localeCompare(String(b.titulo)));
    return dtos(regs.map(r => ({ u: r.urn, s: r.slug, k: r.k, n: r.numero, d: r.data, t: r.titulo, e: r.ementa || '', a: [] })));
  }

  async function baixar(urn) {
    const x = catalogo.obter(urn);
    if (!x) return { ok: false, motivo: 'Norma não encontrada no catálogo.' };
    const b = await biblioteca.baixar(x);
    return BAIXADO_OK.has(b.status) ? { ok: true, status: b.status, slug: x.s } : { ok: false, status: b.status, motivo: b.motivo || 'Não foi possível baixar esta norma.' };
  }

  /** Ação explícita do usuário: garante a cópia local e coloca a norma no acesso rápido. */
  async function adicionar(urn) {
    const x = catalogo.obter(urn);
    if (!x) return { ok: false, motivo: 'Norma não encontrada no catálogo.' };
    let baixou = false;
    if (!biblioteca.porUrn(urn)) {
      const b = await baixar(urn);
      if (!b.ok) return b;
      baixou = true;
    }
    const r = config.adicionarNorma({ nome: nomeParaAcessoRapido(x), url: urlDaNorma(x.s), norma: { urn: x.u, slug: x.s } });
    return { ok: true, baixou, jaEstava: !!r.existente, item: r.item };
  }

  /** Troca por cópias locais os links do Planalto já cadastrados (ação explícita do usuário). */
  async function migrarPlanalto() {
    const relatorio = [];
    for (const link of config.listarLinks('legislacao')) {
      if (link.norma || !/(^|\.)planalto\.gov\.br$/i.test(hostDe(link.url))) continue;
      const rec = reconhecerEntrada(link.url);
      let achados = !rec ? [] : rec.urn ? [catalogo.obter(rec.urn)].filter(Boolean) : catalogo.buscar(rec.consulta, { limite: 5 });
      if (achados.length > 1) {
        // Endereço sem ano e número repetido em épocas diferentes: o nome que o usuário deu ao link desempata.
        const nome = norm(link.nome);
        const pelaNome = nome ? achados.filter(x => x.h && x.h.includes(nome)) : [];
        if (pelaNome.length === 1) achados = pelaNome;
      }
      if (achados.length !== 1) { relatorio.push({ id: link.id, nome: link.nome, resultado: achados.length ? 'ambiguo' : 'nao-encontrado' }); continue; }
      const x = achados[0];
      const b = await baixar(x.u);
      if (!b.ok) { relatorio.push({ id: link.id, nome: link.nome, resultado: 'falha', motivo: b.motivo }); continue; }
      config.converterParaNorma(link.id, { url: urlDaNorma(x.s), norma: { urn: x.u, slug: x.s }, origemUrl: link.url });
      relatorio.push({ id: link.id, nome: link.nome, resultado: 'convertido', norma: x.t });
    }
    return relatorio;
  }

  /**
   * Abrir uma norma que ainda não está na biblioteca (por exemplo, do Acesso Rápido padrão, que não leva as leis
   * junto) baixa a cópia local na hora, com a mesma limpeza de sempre. Aberturas simultâneas esperam o mesmo download.
   */
  const emAndamento = new Map();
  function puxarPorSlug(slug) {
    if (biblioteca.obter(slug)) return Promise.resolve({ ok: true });
    if (!emAndamento.has(slug)) {
      const x = catalogo.obterPorSlug(slug);
      const p = (x ? baixar(x.u) : Promise.resolve({ ok: false, naoEncontrada: true, motivo: 'Norma não encontrada no catálogo.' }))
        .catch(e => ({ ok: false, motivo: e.message }))
        .finally(() => emAndamento.delete(slug));
      emAndamento.set(slug, p);
    }
    return emAndamento.get(slug);
  }

  // O que a página do catálogo (painel lateral) pode chamar; mudanças no acesso rápido avisam a janela principal.
  const api = {
    buscar: buscarComRede, baixar, biblioteca: minhaBiblioteca,
    adicionar: async (urn) => { const r = await adicionar(urn); if (r.ok) aoAlterarConfig(); return r; },
    migrarPlanalto: async () => { const r = await migrarPlanalto(); aoAlterarConfig(); return r; }
  };

  return {
    catalogo, biblioteca, conferencia, urlDaNorma, urlDoCatalogo: URL_CATALOGO,
    buscar, baixar, adicionar, migrarPlanalto, minhaBiblioteca, puxarPorSlug,
    protocolo: criarManipulador({ biblioteca, conferencia, api, puxar: puxarPorSlug }),
    tentarAtualizarHoje: (opcoes) => conferencia.tentarHoje(opcoes),
    estado: () => ({
      catalogo: { total: catalogo.total, geradoEm: catalogo.geradoEm },
      biblioteca: { total: biblioteca.listar().length },
      conferencia: conferencia.estado()
    })
  };
}

function hostDe(url) { try { return new URL(url).hostname; } catch { return ''; } }

module.exports = { criarServico, urlDaNorma, URL_CATALOGO };
