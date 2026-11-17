/**
 * SuperPROC - Painel: Selecionar minuta por agendamento
 *
 * O que faz: na Área de Trabalho de Minutas, marca as minutas cujo texto de agendamento contém o que você digitar
 *   (busca sem acentos e sem diferenciar maiúsculas), com botão para desmarcar.
 * Onde roda: Área de Trabalho de Minutas (acao=minuta_area_trabalho*).
 * Dados: nenhum.
 */
export default {
    init(context) {
        const params = context?.params || new URL(window.location.href).searchParams;
        if (!(params.get('acao') || '').startsWith('minuta_area_trabalho')) return;
        if (window.__SUPERPROC_MINUTA_AGENDAMENTO__) return;
        window.__SUPERPROC_MINUTA_AGENDAMENTO__ = true;

        function normalizarTexto(texto) {
            return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        }

        function obterLinhas(tabela) {
            // Só as linhas da tabela principal, sem caixas de tabelas dentro do teor da minuta.
            return Array.from(tabela.tBodies)
                .flatMap(tbody => Array.from(tbody.rows))
                .filter(linha => linha.id.startsWith('tr_'));
        }

        function obterIndiceAgendamento(tabela) {
            const cabecalho = Array.from(tabela.rows).find(linha =>
                Array.from(linha.cells).some(celula => celula.tagName === 'TH'));
            const coluna = cabecalho && Array.from(cabecalho.cells).find(celula =>
                celula.innerHTML.includes('IdMinutaAgendamento') ||
                normalizarTexto(celula.textContent).includes('agendamento'));
            return coluna ? coluna.cellIndex : 11;
        }

        function obterTextoAgendamento(linha, indice) {
            // O AZflow pode apresentar o agendamento como metadado do layout moderno.
            const metadado = linha.querySelector('.azflow-atminuta-meta-item-agendamento .azflow-atminuta-meta-value');
            const celula = metadado || linha.cells[indice];
            return celula ? normalizarTexto(celula.textContent) : null;
        }

        function obterCheckbox(linha) {
            return linha.cells[0]?.querySelector('input.infraCheckbox[type="checkbox"]');
        }

        function alterarSelecao(checkbox, marcar) {
            // O clique executa os handlers da página mesmo no mundo isolado da extensão.
            // Apenas mudar .checked não atualizaria hdnInfraItensSelecionados.
            if (checkbox.checked !== marcar) checkbox.click();
            checkbox.closest('tr').classList.toggle('infraTrMarcada', checkbox.checked);
        }

        function executarFiltro() {
            const input = document.getElementById('txtTermoAgendamento');
            const resultado = document.getElementById('lblResultadoFiltro');
            const termo = normalizarTexto(input.value);
            if (!termo) {
                resultado.textContent = 'Digite um termo para pesquisar.';
                input.focus();
                return;
            }

            const tabela = document.getElementById('tabelaMinutas');
            if (!tabela) {
                resultado.textContent = 'Tabela de minutas não encontrada.';
                return;
            }

            const indice = obterIndiceAgendamento(tabela);
            let total = 0;
            for (const linha of obterLinhas(tabela)) {
                const checkbox = obterCheckbox(linha);
                const texto = obterTextoAgendamento(linha, indice);
                if (!checkbox || checkbox.disabled || texto === null) continue;
                alterarSelecao(checkbox, texto.includes(termo));
                if (checkbox.checked) total++;
            }
            resultado.textContent = `${total} marcada(s)`;
        }

        function desmarcarTodos() {
            const tabela = document.getElementById('tabelaMinutas');
            if (tabela) {
                for (const linha of obterLinhas(tabela)) {
                    const checkbox = obterCheckbox(linha);
                    if (checkbox && !checkbox.disabled) alterarSelecao(checkbox, false);
                }
            }
            document.getElementById('lblResultadoFiltro').textContent = '0 marcada(s)';
        }

        function criarPainel() {
            const tabela = document.getElementById('tabelaMinutas');
            if (!document.body || !tabela) return;
            const ancora = tabela.closest('#divInfraAreaTabela') || tabela;
            const painelExistente = document.getElementById('painelFiltroAgendamento');
            if (painelExistente) {
                if (painelExistente.nextElementSibling !== ancora) ancora.before(painelExistente);
                return;
            }

            const painel = document.createElement('div');
            painel.id = 'painelFiltroAgendamento';
            painel.setAttribute('role', 'group');
            painel.setAttribute('aria-label', 'Selecionar minuta por agendamento');
            painel.style.cssText = `
                position: static; margin: 0 0 10px; width: 99%;
                background: #fff; border: 2px solid #0056b3; border-radius: 6px;
                padding: 8px 12px; box-shadow: 0 4px 12px rgba(0,0,0,.25);
                display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
                font: 12px sans-serif; max-width: 100%; box-sizing: border-box;
            `;
            painel.innerHTML = `
                <label for="txtTermoAgendamento" style="font-weight:bold;color:#0056b3;">Agendamento:</label>
                <input type="text" id="txtTermoAgendamento" placeholder="Ex: julgamento"
                    style="padding:4px 6px;border:1px solid #aaa;border-radius:4px;width:140px;font-size:12px;">
                <button type="button" id="btnFiltrarAgendamento"
                    style="padding:5px 10px;background:#007bff;color:#fff;border:0;border-radius:4px;font-weight:bold;cursor:pointer;">Marcar</button>
                <button type="button" id="btnDesmarcarTudo"
                    style="padding:5px 10px;background:#6c757d;color:#fff;border:0;border-radius:4px;cursor:pointer;">Desmarcar</button>
                <span id="lblResultadoFiltro" role="status" aria-live="polite" style="font-weight:bold;color:#0056b3;"></span>
            `;
            painel.querySelector('#btnFiltrarAgendamento').addEventListener('click', executarFiltro);
            painel.querySelector('#btnDesmarcarTudo').addEventListener('click', desmarcarTodos);
            painel.querySelector('#txtTermoAgendamento').addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    executarFiltro();
                }
            });
            ancora.before(painel);
        }

        // Aguarda tabelas carregadas por AJAX e recria o painel caso a página o substitua.
        const observer = new MutationObserver(criarPainel);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        criarPainel();
    }
};
