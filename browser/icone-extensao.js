'use strict';
// Ícone NATIVO de uma extensão (o declarado no manifest.json dela), como data URL para o menu de Addons.
// Sem instalação não há pasta: devolve null e o menu mantém o marcador provisório.
const fs = require('node:fs');
const path = require('node:path');

const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const MAX_BYTES = 256 * 1024;
const TAMANHO_ALVO = 32; // o menu mostra 18px; 32px fica nítido em telas de alta densidade

function iconeDaExtensao(dir) {
  try {
    if (!dir) return null;
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const icones = manifest.icons || (manifest.action && manifest.action.default_icon) || manifest.browser_action?.default_icon;
    if (!icones || typeof icones !== 'object') return null;
    // Prefere o tamanho mais próximo de 32px (empate: o maior).
    const candidatos = Object.entries(icones).filter(([, rel]) => typeof rel === 'string')
      .sort(([a], [b]) => Math.abs(a - TAMANHO_ALVO) - Math.abs(b - TAMANHO_ALVO) || b - a);
    for (const [, rel] of candidatos) {
      const arquivo = path.resolve(dir, rel);
      const tipo = TIPOS[path.extname(arquivo).toLowerCase()];
      // Só dentro da pasta da extensão e só imagens conhecidas.
      if (!tipo || !arquivo.startsWith(path.resolve(dir) + path.sep)) continue;
      const buf = fs.readFileSync(arquivo);
      if (buf.length > MAX_BYTES) continue;
      return `data:${tipo};base64,${buf.toString('base64')}`;
    }
  } catch { /* extensão sem manifesto legível: sem ícone nativo */ }
  return null;
}

module.exports = { iconeDaExtensao };
