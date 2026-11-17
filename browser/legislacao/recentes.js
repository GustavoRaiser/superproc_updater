'use strict';
/**
 * Últimas leis acessadas (menu da Legislação). Guarda só endereço e nome, os mais recentes primeiro,
 * sem repetir endereço. Arquivo próprio, fora do superproc-config.json, para não disparar sincronização de configuração.
 */
const fs = require('node:fs');
const path = require('node:path');

const valido = (x) => !!x && typeof x.url === 'string' && x.url.length > 0 && x.url.length <= 2000 && typeof x.nome === 'string';

function criarRecentes({ arquivo, max = 8 }) {
  let lista = null;

  function ler() {
    if (lista) return lista;
    try {
      const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      lista = Array.isArray(j) ? j.filter(valido).slice(0, max).map(x => ({ url: x.url, nome: x.nome })) : [];
    } catch (_) { lista = []; }
    return lista;
  }

  function gravar() {
    try {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      fs.writeFileSync(arquivo, JSON.stringify(lista), 'utf8');
    } catch (_) { /* histórico é só conveniência: falha de disco não atrapalha abrir a lei */ }
  }

  /**
   * Põe o endereço no topo. `manterNome`: se o endereço já estava na lista, conserva o nome de antes
   * (o título da página não deve sobrescrever o nome que o usuário deu ao link).
   */
  function registrar({ url, nome }, { manterNome = false } = {}) {
    if (typeof url !== 'string' || !url || url.length > 2000) return;
    const l = ler();
    const i = l.findIndex(x => x.url === url);
    const antigo = i >= 0 ? l.splice(i, 1)[0] : null;
    const novo = String(nome || '').trim();
    const final = (manterNome && antigo && antigo.nome) ? antigo.nome : (novo || (antigo && antigo.nome) || url);
    l.unshift({ url, nome: final.slice(0, 200) });
    if (l.length > max) l.length = max;
    gravar();
  }

  const listar = () => ler().map(x => ({ url: x.url, nome: x.nome }));

  function limpar() { lista = []; gravar(); }

  return { registrar, listar, limpar };
}

module.exports = { criarRecentes };
