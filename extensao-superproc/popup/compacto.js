/**
 * SuperPROC - Popup: botão "Modo Compacto" do card de um módulo.
 * Aparece nos módulos que declaram `compacto` no registry. A opção é gravada só para o
 * módulo do card (Storage.setModuleSettings(<id>, { compacto })), sem afetar os demais.
 */
import { Storage } from '../core/storage.js';

export async function renderCompacto(card, mod, moduloAtivo = true) {
    const config = await Storage.getModuleSettings(mod.id);
    let ligado = config.compacto === true;

    const linha = document.createElement('div');
    linha.className = 'compacto-linha';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'compacto-btn';
    const dica = document.createElement('span');
    dica.className = 'compacto-dica';
    dica.textContent = (mod.compacto && mod.compacto.descricao) || '';
    linha.append(botao, dica);
    card.append(linha);

    function desenhar() {
        botao.textContent = `Modo Compacto: ${ligado ? 'ligado' : 'desligado'}`;
        botao.setAttribute('aria-pressed', String(ligado));
        botao.classList.toggle('ligado', ligado);
    }
    botao.addEventListener('click', async () => {
        const novo = !ligado;
        botao.disabled = true;
        try {
            await Storage.setModuleSettings(mod.id, { compacto: novo });
            ligado = novo;
        } catch (erro) {
            console.warn('[SuperPROC] Não foi possível gravar o modo compacto:', erro);
        } finally {
            botao.disabled = false;
            desenhar();
        }
    });
    desenhar();

    const atualizar = (ativo) => { botao.disabled = !ativo; linha.classList.toggle('inativo', !ativo); };
    atualizar(moduloAtivo);
    return atualizar;
}
