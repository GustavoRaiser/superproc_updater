/**
 * SuperPROC - Regras puras de edição de texto da minuta (sem DOM).
 * Portadas do script AutoHotkey de formatação rápida (F17/F22/F23). Usadas por modules/editor/editor_texto_main.js
 * no navegador (window.SuperprocTextoRegras) e por scripts/test-editor-texto.cjs no Node (module.exports).
 *
 * Diferença deliberada em relação ao AHK: as abreviações (relator, ministro...) só são trocadas como palavra inteira
 * (o StrReplace do AHK trocava também dentro de outras palavras, ex.: "administro").
 */
(function (raiz, fabrica) {
    const api = fabrica();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else raiz.SuperprocTextoRegras = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PALAVRAS_PEQUENAS = ['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'na', 'nas', 'no', 'nos'];

    // ---------- Tipografia (F22, 1 clique) ----------
    const ABREVIACOES = [
        ['julgado em', 'j.'],
        ['relatora', 'Rel.'], ['relator', 'Rel.'],
        ['desembargadora', 'Des.'], ['desembargador', 'Des.'],
        ['ministra', 'Min.'], ['ministro', 'Min.']
    ].map(([termo, troca]) => [new RegExp(`(?<![\\p{L}\\p{N}])${termo}(?![\\p{L}\\p{N}])`, 'giu'), troca]);

    function normalizarAspas(texto) {
        let t = String(texto)
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'");
        for (const [regex, troca] of ABREVIACOES) t = t.replace(regex, troca);
        return t;
    }

    function normalizarDatas(texto) {
        return String(texto)
            .replace(/\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b/g, '$1.$2.$3')
            .replace(/\b(\d{1})\.(\d{1})\.(\d{4})\b/g, '0$1.0$2.$3')
            .replace(/\b(\d{1})\.(\d{2})\.(\d{4})\b/g, '0$1.$2.$3')
            .replace(/\b(\d{2})\.(\d{1})\.(\d{4})\b/g, '$1.0$2.$3');
    }

    function normalizarDocumentos(texto) {
        return String(texto)
            .replace(/\b(\d{3})(\d{3})(\d{3})(\d{2})\b/g, '$1.$2.$3-$4')
            .replace(/\b(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})\b/g, '$1.$2.$3/$4-$5');
    }

    function normalizarTudo(texto) {
        return normalizarDocumentos(normalizarDatas(normalizarAspas(texto)));
    }

    // ---------- Caixa (F22) ----------
    function capitalizar(palavraMinuscula) {
        return palavraMinuscula.replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, antes, letra) => antes + letra.toUpperCase());
    }

    /** `estado` (opcional) carrega a contagem de palavras entre trechos: só a 1ª palavra de toda a seleção é sempre maiúscula. */
    function tituloCaso(texto, estado = { palavras: 0 }) {
        return String(texto).split(/( )/).map((parte) => {
            if (parte === '' || parte === ' ') return parte;
            const minuscula = parte.toLowerCase();
            const indice = estado.palavras++;
            return indice > 0 && PALAVRAS_PEQUENAS.includes(minuscula) ? minuscula : capitalizar(minuscula);
        }).join('');
    }

    const paraMaiusculas = (texto) => String(texto).toUpperCase();
    const paraMinusculas = (texto) => String(texto).toLowerCase();

    // ---------- Limpeza (F17) — versão em texto puro (a do editor trabalha no DOM, com a mesma regra) ----------
    function removerLinhasVaziasTexto(texto) {
        const limpo = String(texto).replace(/[   ]/g, ' ').replace(/\r\n|\r|\n/g, '\n');
        return limpo.split('\n').map(l => l.replace(/^[ \t]+|[ \t]+$/g, '')).filter(l => l !== '').join('\r\n');
    }

    function removerQuebrasTexto(texto) {
        let t = String(texto);
        const quebraFinal = /(\r\n|\n|\r)$/.test(t);
        t = t.replace(/(\r\n|\n|\r)$/, '').replace(/(\r\n|\n|\r)+/g, ' ');
        return quebraFinal ? t + '\r\n' : t;
    }

    // ---------- Ementa (F17 segurar+2 cliques / F20) ----------
    const TRIBUNAL = /^(STJ|STF|CNJ|STM|TST|TSE|TJ[A-Z]{2,4}|TRF[1-6]|TRT([1-9]|1[0-9]|2[0-4])|TRE[A-Z]{2})$/i;

    const CLASSES = [
        [/\b(Agravo\s+Interno|AgInt)\b/i, 'AgInt'],
        [/\b(Agravo\s+em\s+Recurso\s+Especial|AREsp)\b/i, 'AREsp'],
        [/\b(Recurso\s+Especial|REsp)\b/i, 'REsp'],
        [/\b(Embargos\s+de\s+Diverg[eê]ncia|EREsp)\b/i, 'EREsp'],
        [/\b(Recurso\s+Extraordin[aá]rio\s+com\s+Agravo|ARE)\b/i, 'ARE'],
        [/\b(Recurso\s+em\s+Mandado\s+de\s+Seguran[cç]a|RMS)\b/i, 'RMS'],
        [/\b(Recurso\s+em\s+Habeas\s+Corpus|RHC)\b/i, 'RHC'],
        [/\b(Recurso\s+em\s+Habeas\s+Data|RHD)\b/i, 'RHD'],
        [/\b(Agravo\s+Regimental\s+no\s+Recurso\s+Extraordin[aá]rio|AgR)\b/i, 'AgR'],
        [/\b(Agravo\s+Regimental|AgRg|AgR)\b/i, 'AgR'],
        [/\b(Agravo\s+de\s+Instrumento|AI)\b/i, 'AI'],
        [/\b(Recurso\s+Extraordin[aá]rio|RE)\b/i, 'RE'],
        [/\b(Recurso\s+Criminal|RC)\b/i, 'RC'],
        [/(A[cç][aã]o\s+Declarat[oó]ria\s+de\s+Constitucionalidade|ADC)\b/i, 'ADC'],
        [/(Argui[cç][aã]o\s+de\s+Descumprimento\s+de\s+Preceito\s+Fundamental|ADPF)\b/i, 'ADPF'],
        [/(A[cç][aã]o\s+Direta\s+de\s+Inconstitucionalidade|ADI)\b/i, 'ADI'],
        [/(Ato\s+das\s+Disposi[cç][oõ]es\s+Constitucionais\s+Transit[oó]rias|ADCT)\b/i, 'ADCT'],
        [/(A[cç][aã]o\s+C[ií]vel\s+Origin[aá]ria|ACO)\b/i, 'ACO'],
        [/(A[cç][aã]o\s+Ordin[aá]ria\s+Regressiva|AOR)\b/i, 'AOR'],
        [/(A[cç][aã]o\s+Origin[aá]ria\s+Especial|AOE)\b/i, 'AOE'],
        [/(A[cç][aã]o\s+Origin[aá]ria|AO)\b/i, 'AO'],
        [/(A[cç][aã]o\s+Rescis[oó]ria|AR)\b/i, 'AR'],
        [/(Argui[cç][aã]o\s+de\s+Impedimento|AImp)\b/i, 'AImp'],
        [/(Apela[cç][aã]o(\s+C[ií]v(el)?)?|Ap\.?\s*C[ií]v(\.|\b)|ApCiv\b)/i, 'AC'],
        [/(Conflito\s+de\s+Atribui[cç][oõ]es|CA)\b/i, 'CA'],
        [/(Conflito\s+de\s+Compet[eê]ncia|CC)\b/i, 'CC'],
        [/(Conflito\s+de\s+Jurisdi[cç][aã]o|CJ)\b/i, 'CJ'],
        [/(Embargos\s+de\s+Declara[cç][aã]o|EDcl|ED)\b/i, 'EDcl'],
        [/(Embargos\s+Infringentes|EI)\b/i, 'EI'],
        [/(A[cç][aã]o\s+Penal|\bAP\b)/i, 'AP'],
        [/(Execu[cç][aã]o\s+Penal|EP)\b/i, 'EP'],
        [/(Habeas\s+Corpus|HC)\b/i, 'HC'],
        [/(Habeas\s+Data|HD)\b/i, 'HD'],
        [/(Mandado\s+de\s+Seguran[cç]a|MS)\b/i, 'MS'],
        [/(Mandado\s+de\s+Injun[cç][aã]o|MI)\b/i, 'MI'],
        [/(Medida\s+Cautelar|MC)\b/i, 'MC'],
        [/(Reclama[cç][aã]o|Rcl)\b/i, 'Rcl'],
        [/(Carta\s+Rogat[oó]ria|CR)\b/i, 'CR'],
        [/(Recurso\s+Inominado\s|CR)\b/i, 'RI']
    ];

    /**
     * Reescreve a última referência entre parênteses: "(Corte, Classe n. X, Rel. Des. Fulano, j. dd.mm.aaaa)".
     * Devolve o texto novo, ou null se não houver parênteses.
     */
    function formatarEmenta(entrada) {
        let txt = String(entrada).replace(/^\s*(EMENTA|DECIS[ÃA]O):\s*/i, '');

        let ultimoPos = -1;
        let trechoCompleto = '';
        let conteudo = '';
        const busca = /\(([^()]*)\)/g;
        let m;
        while ((m = busca.exec(txt)) !== null) {
            ultimoPos = m.index;
            trechoCompleto = m[0];
            conteudo = m[1];
        }
        if (ultimoPos < 0) return null;

        const partes = conteudo.split(',');
        let processoCompleto = '';
        let relator = '';
        let data = '';
        let corte = '';

        const primeiraParte = partes[0].trim();
        if (TRIBUNAL.test(primeiraParte)) corte = primeiraParte;

        partes.forEach((parte, indice) => {
            const parteTrim = parte.trim();

            if (indice === 0 && corte !== '') return;
            if (/\b(Câmara|Cam\.|Turma|Seção|Secao|Órgão Especial|Orgão Especial|Pleno|Plenário)\b/i.test(parteTrim)) return;
            if (/^\s*(de|da|do|comarca)\b/i.test(parteTrim)) return;

            if (data === '') {
                const mData = parteTrim.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/i);
                if (mData && !/\d{5,}/.test(parteTrim)) {
                    const dia = mData[1].length === 1 ? '0' + mData[1] : mData[1];
                    const mes = mData[2].length === 1 ? '0' + mData[2] : mData[2];
                    let ano = mData[3];
                    if (ano.length === 2) ano = '20' + ano;
                    data = `${dia}.${mes}.${ano}`;
                    return;
                }
            }

            if (processoCompleto === '') {
                let achouClasse = false;
                for (const [padrao, sigla] of CLASSES) {
                    if (padrao.test(parteTrim)) {
                        processoCompleto = parteTrim.replace(padrao, sigla);
                        achouClasse = true;
                        break;
                    }
                }
                if (!achouClasse && /\d+[-.]\d+/.test(parteTrim)) {
                    processoCompleto = parteTrim;
                    achouClasse = true;
                }
                if (achouClasse) {
                    if (!/\b(n\.|nº|no)\b/i.test(processoCompleto)) {
                        processoCompleto = processoCompleto.replace(/^([A-Za-z]+)\s*(\d+)/i, '$1 n. $2');
                    }
                    return;
                }
            }

            if (relator === '') {
                let tempRel = parteTrim;
                for (let i = 0; i < 5; i++) {
                    tempRel = tempRel.replace(/^\s*(relator|rel\.|desembargador|des\.|ministro|min\.|juiz|juíza|j\.|julgado em)\s*/i, '');
                }
                tempRel = tempRel.trim();
                if (tempRel !== '' && !/^\d+$/.test(tempRel)) relator = tempRel;
            }
        });

        let cargoRelator = 'Des.';
        if (corte !== '') {
            if (/^(STJ|STF|STM|TST|TSE)$/i.test(corte)) cargoRelator = 'Min.';
        } else if (/\b.*RESP.*\b/i.test(processoCompleto)) {
            corte = 'STJ'; cargoRelator = 'Min.';
        } else if (/\b.*(ARE|RE|ADC|ADI|ADPF)\b/i.test(processoCompleto)) {
            corte = 'STF'; cargoRelator = 'Min.';
        } else if (/\b.*RMS.*\b/i.test(processoCompleto)) {
            corte = 'STJ'; cargoRelator = 'Min.';
        } else {
            corte = 'TJSC'; cargoRelator = 'Des.';
        }

        let novaRef = '(';
        if (corte !== '') novaRef += corte + ', ';
        if (processoCompleto !== '') novaRef += processoCompleto;
        if (relator !== '') novaRef += ', Rel. ' + cargoRelator + ' ' + tituloCaso(relator);
        if (data !== '') novaRef += ', j. ' + data;
        novaRef += ')';

        const antes = txt.slice(0, ultimoPos).replace(/Dispositivos?\s+citados?:[\s\S]*$/i, '');
        const depois = txt.slice(ultimoPos + trechoCompleto.length);
        return antes + novaRef + depois;
    }

    return {
        normalizarAspas, normalizarDatas, normalizarDocumentos, normalizarTudo,
        tituloCaso, paraMaiusculas, paraMinusculas,
        removerLinhasVaziasTexto, removerQuebrasTexto,
        formatarEmenta
    };
});
