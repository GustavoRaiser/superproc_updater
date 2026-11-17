/**
 * SuperPROC - Módulo: Integração com AZflow
 *
 * O que faz: quando o layout do SuperPROC esconde a posição original do botão "Redesign AZ" (do AZflow) na capa do
 *   processo, move o botão real para um lugar visível, sem recriá-lo (os listeners do AZflow continuam valendo), e o
 *   devolve à posição original quando o layout muda.
 * Onde roda: capa do processo (acao=processo_selecionar).
 * Dados: nenhum. Sem o AZflow instalado, o módulo não faz nada.
 */
export function iniciarIntegracaoAzflow(doc = document, win = window) {
    doc.body.classList.add('superproc-integracao-azflow');
    const id = 'azflow-proc-redesign-button';
    let original = null, marcador = null, abrigo = null, pendente = false, encerrado = false;
    const visivel = el => {
        for (let atual = el; atual && atual.nodeType === 1; atual = atual.parentElement) {
            const estilo = win.getComputedStyle(atual);
            if (atual.hidden || estilo.display === 'none' || estilo.visibility === 'hidden') return false;
        }
        return true;
    };
    function restaurar() {
        if (original?.isConnected) {
            if (marcador?.isConnected) marcador.parentNode.insertBefore(original, marcador);
            else if (abrigo?.isConnected) abrigo.parentNode.insertBefore(original, abrigo);
        }
        marcador?.remove(); abrigo?.remove();
        original = marcador = abrigo = null;
    }
    function reconciliar() {
        pendente = false;
        if (encerrado) return;
        // A página refez a barra onde o abrigo estava (o abrigo saiu junto com o botão): o botão volta à posição original.
        if (original && !abrigo?.isConnected && marcador?.isConnected) {
            marcador.parentNode.insertBefore(original, marcador);
            marcador.remove();
            original = marcador = abrigo = null;
        } else if (original && !original.isConnected) restaurar();
        if (original && marcador?.parentElement && visivel(marcador.parentElement)) { restaurar(); return; }
        const botao = doc.getElementById(id);
        if (!botao || botao === original || !botao.parentNode || visivel(botao)) return;
        // Preferência: logo à ESQUERDA do botão "Página inicial" (#btn-home) da barra do eproc.
        const casa = doc.getElementById('btn-home');
        const aoLadoDaLotacao = casa && casa.parentNode && visivel(casa) ? casa : null;
        const destino = aoLadoDaLotacao || doc.querySelector('.botoes-flutuantes-container') || doc.querySelector('#page-content-wrapper');
        if (!destino || !visivel(destino)) return;
        original = botao;
        marcador = doc.createComment('superproc-azflow-posicao-original');
        botao.parentNode.insertBefore(marcador, botao);
        abrigo = doc.createElement('span');
        abrigo.className = 'superproc-azflow-ancora';
        abrigo.style.cssText = 'display:inline-flex;align-items:center;margin:0 6px;vertical-align:middle';
        // Na barra do eproc o ícone ficaria sobre o fundo da barra: leva o fundo branco que tinha na posição original.
        if (aoLadoDaLotacao) abrigo.style.cssText += ';background:#fff;border-radius:6px;padding:2px 4px;flex:none;align-self:center';
        if (aoLadoDaLotacao) destino.before(abrigo); else destino.prepend(abrigo);
        abrigo.append(botao);
    }
    // O AZflow devolve o botão ao título dele (.azflow-acoes-eventos) a cada renderização, inclusive no clique que abre o menu:
    // com o título oculto, o menu calcula a posição com o botão invisível (canto superior esquerdo) e o abrigo fica vazio.
    // Esta correção roda como microtarefa do observador (antes da pintura): põe o botão de volta no abrigo e, se o menu já
    // abriu, dispara 'resize' (o menu se reposiciona nesse evento) para ele reancorar no botão.
    function recolherSeAZflowDevolveu() {
        if (encerrado || !original || !abrigo?.isConnected || abrigo.contains(original)) return;
        if (!original.isConnected || (marcador?.parentElement && visivel(marcador.parentElement))) return;
        abrigo.append(original);
        if (doc.getElementById('azflow-proc-redesign-menu')) win.dispatchEvent(new win.Event('resize'));
    }
    function agendar() {
        if (pendente || encerrado) return;
        pendente = true;
        win.setTimeout(reconciliar, 0);
    }
    const observer = new win.MutationObserver(() => { recolherSeAZflowDevolveu(); agendar(); });
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    reconciliar();
    return () => { encerrado = true; observer.disconnect(); restaurar(); doc.body.classList.remove('superproc-integracao-azflow'); };
}

export default {
    init() {
        const limpar = iniciarIntegracaoAzflow();
        window.addEventListener('pagehide', limpar, { once: true });
    }
};
