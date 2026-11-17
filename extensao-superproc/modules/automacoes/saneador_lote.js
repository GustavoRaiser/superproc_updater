/**
 * SuperPROC - Módulo: Automações em lote (ex.: Saneador)
 *
 * O que faz: painel na lista de processos de um localizador e na capa do processo que percorre uma fila: captura os
 *   processos, ignora os que já têm "Feito", prepara a análise no Copilot (agente e comando configurados) e, depois de
 *   a minuta ser salva, insere o localizador final.
 * Onde roda: lista de processos por localizador e capa do processo (acao=localizador_processos_lista e
 *   processo_selecionar), somente na página principal (não nos frames de dados).
 * Dados (storage da extensão): automações em superproc_automations_v1 e catálogo de localizadores por unidade em
 *   superproc_automation_catalogs_v1 (preenchido ao abrir listas de processos).
 * Como configurar: popup da extensão › Automações. A automação "Saneador" vem em branco e desativada: escolha a
 *   fila, o agente do Copilot e o localizador final da sua unidade.
 */
import { loadAutomations, defaultAutomation, validateAutomation, automationMatches, captureAutomationCatalog } from '../../core/automations.js';
import { inserirLocalizadorSaneador } from '../../core/saneador_localizador.js';
import { captureProcessList, listName, publishNavigation } from '../../core/lista_processos.js';
import { makeBatch, firstPending, markLoaded } from './saneador_lote_state.js';

const get = async key => (await chrome.storage.local.get(key))[key];
const set = (key, value) => chrome.storage.local.set({ [key]: value });
const escape = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unitOf = () => document.querySelector('#selInfraUnidades')?.value || '';
export default {
    async init(context = {}) {
        // A fila pertence à página principal; frames de dados não ganham outro painel.
        if (window !== window.top || document.getElementById('superproc-saneador-lote')) return;
        const params = context.params || new URLSearchParams(location.search);
        if (!['localizador_processos_lista', 'processo_selecionar'].includes(params.get('acao'))) return;
        const isList = params.get('acao') === 'localizador_processos_lista';
        const unit = unitOf();
        const key = `superproc_saneador_lote_v1:${location.origin}:${unit}`;
        let batch = await get(key);
        if(batch && !batch.config) batch.config = defaultAutomation();
        const process = (params.get('num_processo') || params.get('txtNumProcesso') || document.querySelector('#txtNumProcesso')?.value || '').replace(/\D/g, '');
        if (!isList && (!batch?.running || batch.currentId !== process)) return;
        let available = [];
        if(isList) {
            await captureAutomationCatalog().catch(()=>{});
            const locatorIds = [...new Set([params.get('selLocalizador'), ...[...(document.querySelector('#selLocalizador')?.selectedOptions || [])].map(o=>o.value)].filter(Boolean))];
            available = (await loadAutomations()).filter(config => automationMatches(config, {origin:location.origin,unit,locatorIds}));
            if(!available.length) return;
        }
        let selectedConfig = isList ? available.find(c=>c.id===batch?.config?.id) || available[0] : batch.config;
        if(isList && batch && batch.config.id !== selectedConfig.id) batch = null;
        const panel = document.createElement('section'); panel.id = 'superproc-saneador-lote';
        panel.innerHTML = `
            <div class="sp-san-head">
                <strong data-title>Automação · ${escape(selectedConfig.name)}</strong>${isList && available.length > 1 ? '<select data-automation aria-label="Automação"></select>' : ''}<div data-progress class="sp-san-progress"></div>
                <button type="button" ${isList ? 'data-capture' : 'data-start'} class="sp-san-start">INICIAR</button>
                <button type="button" data-interrupt>INTERROMPER</button>
                <button type="button" data-toggle aria-expanded="false" aria-controls="sp-san-details" title="Mostrar detalhes">▸</button>
            </div>
            <div id="sp-san-details" hidden>
                <div data-workflow class="sp-san-workflow"></div>
                <p data-message>Captura os processos da página atual e aplica os localizadores excluídos da automação.</p><div data-summary></div>
                <div class="sp-san-buttons">
                    <button type="button" data-open hidden>Abrir primeiro pendente</button>
                    <button type="button" data-check hidden>Conferi a preparação</button>
                    <button type="button" data-pdf ${isList ? 'hidden' : ''}>Reexecutar documentos e PDF</button>
                    <button type="button" data-copilot ${isList ? 'hidden' : ''}>Enviar ao agente</button>
                    <button type="button" data-minuta ${isList ? 'hidden' : ''}>Salvar minuta e seguir</button>
                    <button type="button" data-show-copilot ${isList ? 'hidden' : ''}>Abrir Copilot</button>
                    <button type="button" data-return ${isList ? 'hidden' : ''}>Voltar à lista</button>
                    <button type="button" data-export hidden>Exportar progresso</button>
                </div>
                <details><summary>Dados da execução</summary><ul data-checks></ul><div data-pdf-result></div><div data-copilot-result></div><div data-minuta-result></div><pre data-response style="white-space:pre-wrap;max-height:280px;overflow:auto"></pre><ol data-stages></ol></details>
                <details><summary>Fila e progresso por processo</summary><div class="sp-san-scroll"><table><thead><tr><th>Processo</th><th>Estado</th></tr></thead><tbody data-items></tbody></table></div></details>
                <details><summary>Registro de progresso</summary><ol data-log></ol></details>
            </div>`;
        const style = document.createElement('style');
        style.textContent = `#superproc-saneador-lote{margin:10px 0;padding:8px 10px;border:1px solid #79aaca;border-left:4px solid #007eaf;border-radius:6px;background:#f1f8ff;color:#173d58;font:12px Arial;text-align:left}#superproc-saneador-lote [hidden]{display:none!important}#superproc-saneador-lote .sp-san-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#superproc-saneador-lote .sp-san-progress{display:flex;gap:12px;flex:1;flex-wrap:wrap}#superproc-saneador-lote .sp-san-group{display:flex;gap:5px;align-items:center;white-space:nowrap}#superproc-saneador-lote .sp-san-box{width:12px;height:12px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #94a7b4;border-radius:2px;background:white;color:white;font-size:11px}#superproc-saneador-lote .sp-san-box.done{background:#28a765;border-color:#28a765}#superproc-saneador-lote button{padding:5px 8px;border:1px solid #a0b9cd;border-radius:4px;background:white;cursor:pointer;color:#075582}#superproc-saneador-lote .sp-san-start{background:#28a765;border-color:#28a765;color:white;font-weight:bold}#superproc-saneador-lote [data-interrupt]{background:#b42318;border-color:#b42318;color:white}#superproc-saneador-lote button:disabled{opacity:.45;cursor:default}#superproc-saneador-lote .sp-san-buttons{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}#superproc-saneador-lote .sp-san-workflow{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:12px}#superproc-saneador-lote .sp-san-workflow ul{list-style:none;margin:6px 0;padding:0}#superproc-saneador-lote .sp-san-workflow li{display:flex;align-items:center;gap:6px;margin:5px 0}#superproc-saneador-lote details{margin-top:8px}#superproc-saneador-lote summary{cursor:pointer}#superproc-saneador-lote table{width:100%;border-collapse:collapse}#superproc-saneador-lote td,#superproc-saneador-lote th{padding:5px 8px;border-bottom:1px solid #cfdfeb;text-align:left}#superproc-saneador-lote .sp-san-scroll{max-height:220px;overflow:auto}`;
        document.head.appendChild(style);
        const table = [...document.querySelectorAll('table')].find(t => t.querySelector('a[href*="acao=processo_selecionar"]'));
        const target = isList ? (table?.closest('#divInfraAreaTabela') || table) : document.querySelector('#fldCapa, #divInfraAreaProcesso, #divCapaProcesso, #fldCapaProcesso');
        if (target) target.before(panel); else (document.querySelector('#frmProcessoLista') || document.body).prepend(panel);
        const automationSelect = panel.querySelector('[data-automation]');
        if(automationSelect) {
            automationSelect.innerHTML = available.map(c=>'<option value="'+escape(c.id)+'">'+escape(c.name)+'</option>').join('');
            automationSelect.value = selectedConfig.id;
            automationSelect.onchange = () => { selectedConfig = available.find(c=>c.id===automationSelect.value); batch = null; panel.querySelector('[data-title]').textContent = 'Automação · '+selectedConfig.name; render(); };
        }
        const message = text => { panel.querySelector('[data-message]').textContent = text; panel.querySelector('[data-toggle]').title = text + ' — Mostrar detalhes'; };
        panel.querySelector('[data-toggle]').onclick = () => { const details = panel.querySelector('#sp-san-details'); details.hidden = !details.hidden; panel.querySelector('[data-toggle]').textContent = details.hidden ? '▸' : '▾'; panel.querySelector('[data-toggle]').setAttribute('aria-expanded', String(!details.hidden)); };
        let locatorController;
        let busy = false, interrupted = !!batch?.interruptedAt;
        const resumeExecution = () => { interrupted = false; if (batch) { batch.interruptedAt = null; batch.running = true; } };
        const advance = (group, index) => { if (!batch) return; batch.workflow ||= {}; batch.workflow[group] ||= [false,false,false]; batch.workflow[group][index] = true; render(); };
        function render() {
            if(automationSelect) automationSelect.disabled = busy || !!batch?.running;
            const w = batch?.workflow || {};
            const groups = [
                ['Preparação de Workflow', [batch?.checks.lista, batch?.checks.feitos, batch?.checks.primeiro], ['Captura e armazenamento de lista','Limpeza de processos ignorados','Identificação de primeiro processo']],
                ['Etapa 1', [w.pdf?.[0] || !!batch?.pdf, w.pdf?.[1] || !!batch?.pdf, !!batch?.pdf], ['Abertura de Processo e Árvore','Auto-seleção de documentos','Impressão']],
                ['Etapa 2', [w.copilot?.[0] || !!batch?.copilot, w.copilot?.[1] || !!batch?.copilot, !!batch?.copilot], ['Abertura de janela do Copilot e seleção do Agente','Envio de Comando e PDF','Recebimento de conteúdo e limpeza']],
                ['Etapa 3', [w.minuta?.[0] || !!batch?.minuta, !!batch?.minuta, !!batch?.localizador], ['Abertura de Minuta até conteúdo','Colagem e finalização com bloqueio','Inserir Localizador e abrir próximo da lista']]
            ];
            const box = (done, label) => '<span class="sp-san-box' + (done ? ' done' : '') + '" role="img" aria-label="' + escape(label + (done ? ': concluído' : ': pendente')) + '">' + (done ? '✓' : '') + '</span>';
            panel.querySelector('[data-progress]').innerHTML = groups.map(([name, done, labels], index) => '<span class="sp-san-group"><span>' + (index ? name : 'Preparação') + '</span>' + done.map((value,i) => box(value, labels[i])).join('') + '</span>').join('');
            panel.querySelector('[data-workflow]').innerHTML = groups.map(([name, done, labels]) => '<div><strong>' + name + '</strong><ul>' + labels.map((label,i) => '<li>' + box(done[i],label) + label + '</li>').join('') + '</ul></div>').join('');
            const startButton = panel.querySelector('[data-start]'); if(startButton) startButton.disabled = busy || (batch?.running && !interrupted && !/^erro/.test(batch.status));
            const count = batch?.items.length || 0, skipped = batch?.items.filter(i => i.status.startsWith('ignorado_')).length || 0;
            const pendingCount = batch?.items.filter(i => !i.excluded && ['pendente', 'verificacao'].includes(i.status)).length || 0;
            panel.querySelector('[data-summary]').textContent = batch ? `${batch.name}: ${count} capturados · ${skipped} ignorados · ${pendingCount} pendentes. Agente: ${batch.agent}.` : '';
            const checks = [
                ['lista', 'Lista capturada e armazenada'], ['feitos', 'Localizadores excluídos reconhecidos; processos ignorados'],
                ['primeiro', 'Primeiro processo pendente identificado'], ['carregamento', 'Capa do primeiro pendente carregada']
            ];
            panel.querySelector('[data-checks]').innerHTML = checks.map(([id, text]) => `<li>${batch?.checks[id] ? '✅' : '⬜'} ${text}</li>`).join('');
            panel.querySelector('[data-stages]').innerHTML = groups.map(([name, done]) => '<li>' + name + ' — ' + done.filter(Boolean).length + '/3 concluídos</li>').join('');
            const names = { ignorado_feito: 'Ignorado: Feito', pendente: 'Pendente', verificacao: 'Em análise', minuta_salva: 'Minuta salva; localizador pendente', concluido: `Minuta salva · ${batch?.targetLocator || selectedConfig.targetLocator.name} confirmado` };
            panel.querySelector('[data-items]').innerHTML = (batch?.items || []).filter(item => !item.excluded).map(item => `<tr><td>${escape(item.numero)}</td><td>${escape(names[item.status] || item.status)}</td></tr>`).join('');
            panel.querySelector('[data-log]').innerHTML = (batch?.log || []).slice(-30).map(e => `<li>${escape(new Date(e.at).toLocaleTimeString('pt-BR'))}: ${escape(e.text)}</li>`).join('');
            panel.querySelector('[data-open]').hidden = !isList || !batch || (!firstPending(batch) && !batch.currentId);
            panel.querySelector('[data-check]').hidden = !batch?.checks.carregamento || !!batch.verifiedAt;
            panel.querySelector('[data-export]').hidden = !batch;
            panel.querySelector('[data-pdf]').disabled = busy || !batch?.checks.carregamento;
            panel.querySelector('[data-copilot]').disabled = busy || !batch?.pdf || !!batch?.copilot;
            panel.querySelector('[data-minuta]').disabled = busy || !batch?.copilot || !!batch?.localizador;
            panel.querySelector('[data-minuta]').textContent = batch?.minuta ? `Inserir ${batch.targetLocator} e seguir` : batch?.minutaAttempt ? 'Retomar minuta e seguir' : 'Salvar minuta e seguir';
            panel.querySelector('[data-minuta-result]').textContent = batch?.minuta ? `✅ Minuta salva · ${batch.minuta.characters} caracteres · aba fechada. Processo: ${batch.minuta.process}.` : batch?.minutaAttempt ? 'Cadastro iniciado. A retomada usa a mesma tarefa para evitar duplicação.' : 'Minuta ainda não lançada.';
            const pdf = batch?.pdf;
            panel.querySelector('[data-pdf-result]').textContent = pdf ? `✅ AutoMarca e impressão concluídas · ${pdf.selected} documentos selecionados · ${pdf.pages} páginas · ${(pdf.bytes / 1024 / 1024).toFixed(2)} MB · PDF completo obtido. Processo: ${pdf.process}.` : 'PDF ainda não preparado.';
            const response = batch?.copilot;
            panel.querySelector('[data-copilot-result]').textContent = response ? `✅ Conversa nova · ${response.agent} · ${response.fileName} · resposta completa recebida para ${response.process}. Use Abrir Copilot para conferir a conversa.` : 'Conversa ainda não concluída.';
            panel.querySelector('[data-response]').textContent = response?.text || '';
            const capture = panel.querySelector('[data-capture]'); if (capture) capture.disabled = busy;
            panel.querySelector('[data-interrupt]').disabled = !batch?.running || interrupted;
        }
        const persist = async () => { batch.updatedAt = Date.now(); await set(key, batch); render(); };
        async function openFirst() {
            const current = batch.items.find(i => i.id === batch.currentId);
            const item = current && !current.excluded && current.status !== 'concluido' ? current : firstPending(batch);
            if (!item) { message('Nenhum processo pendente após aplicar os localizadores excluídos. Nenhum processo será aberto.'); return; }
            resumeExecution();
            if (batch.currentId !== item.id) {
                batch.pdf = null; batch.copilot = null; batch.minuta = null; batch.localizador = null; batch.minutaAttempt = null; batch.checks.carregamento = false;
            }
            // Preserva a fila também nas chaves da navegação rápida, na MESMA aba.
            // A navegação conserva a lista completa; só o avanço pula Feito.
            publishNavigation(batch.items, batch.name);
            batch.currentId = item.id; item.status = 'verificacao'; batch.checks.primeiro = true;
            batch.status = 'abrindo_primeiro'; batch.log.push({ at: Date.now(), text: `Abrindo primeiro pendente: ${item.numero}.` });
            await persist();
            if (interrupted) return;
            location.assign(item.url);
        }
        const capture = panel.querySelector('[data-capture]');
        if (capture) capture.onclick = async () => {
            if (busy) return; busy = true; render();
            resumeExecution();
            try {
                const items = captureProcessList(document, location.href);
                if (!items.length) throw new Error('Não encontrei processos na tabela desta página.');
                if (items.some(item => !item.feitoKnown)) throw new Error('Não identifiquei a coluna Localizadores de todos os processos. A fila não foi iniciada: preciso conferir os localizadores excluídos.');
                batch = makeBatch(items, { sourceUrl: location.href, name: listName(document), unit, origin: location.origin, config: validateAutomation(selectedConfig) });
                batch.autoThrough3 = true;
                batch.autoMinuta = true;
                await persist(); await openFirst();
            } catch (error) { message(error.message); }
            finally { busy = false; render(); }
        };
        panel.querySelector('[data-open]').onclick = () => openFirst().catch(e => message(e.message));
        panel.querySelector('[data-return]').onclick = () => {
            if (!batch?.sourceUrl || new URL(batch.sourceUrl).origin !== location.origin) return;
            location.assign(batch.sourceUrl);
        };
        panel.querySelector('[data-check]').onclick = async () => {
            batch.verifiedAt = Date.now(); batch.status = 'etapa_1_conferida';
            batch.log.push({ at: Date.now(), text: 'Usuário confirmou a fila, os localizadores excluídos e o primeiro processo aberto.' });
            await persist(); message('Etapa 1 conferida. Próxima etapa: Automarcar e obter o PDF único.');
        };
        panel.querySelector('[data-pdf]').onclick = async () => {
            if (busy) return; busy = true; render();
            resumeExecution();
            try {
                if (!batch.verifiedAt) { batch.verifiedAt = Date.now(); batch.log.push({ at: Date.now(), text: 'Etapa 1 conferida ao iniciar a etapa 2.' }); }
                if (batch.minutaAttempt || batch.minuta) throw new Error('O lançamento da minuta já foi iniciado. Use Retomar minuta para preservar a resposta.');
                batch.workflow ||= {}; batch.workflow.pdf = [false,false,false]; batch.pdf = null; batch.copilot = null; batch.status = 'preparando_pdf'; await persist();
                message('Etapa 1: aguardando AutoMarca, seleção estável e PDF novo da impressão…');
                const result = await new Promise((resolve, reject) => {
                    const id = crypto.randomUUID();
                    const cleanup = () => { clearTimeout(timer); clearTimeout(ackTimer); window.removeEventListener('message', listener); };
                    const listener = event => {
                        if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.id !== id) return;
                        if (event.data.type === 'superproc:saneador-pdf-ack') { clearTimeout(ackTimer); message('Pedido recebido pelo navegador. Localizando a árvore e executando a AutoMarca…'); return; }
                        if (event.data.type === 'superproc:saneador-pdf-progress') { if(event.data.phase === 'arvore') advance('pdf',0); if(event.data.phase === 'selecao') advance('pdf',1); set(key,batch).catch(()=>{}); return; }
                        if (event.data.type !== 'superproc:saneador-pdf-result') return;
                        cleanup();
                        event.data.result?.error ? reject(new Error(event.data.result.error)) : resolve(event.data.result);
                    };
                    const timer = setTimeout(() => { cleanup(); reject(new Error('A preparação do PDF excedeu o prazo. Confira o leitor e tente novamente.')); }, 280000);
                    const ackTimer = setTimeout(() => { cleanup(); reject(new Error('A ponte do navegador não recebeu o pedido. Reinicie o SuperPROC Browser atualizado.')); }, 5000);
                    window.addEventListener('message', listener);
                    window.postMessage({ type: 'superproc:saneador-pdf', id, process, config: batch.config }, location.origin);
                });
                if (result.process !== process || !result.pages || !result.bytes || !result.sha256) throw new Error('Resultado do PDF incompleto ou de outro processo.');
                batch.pdf = { ...result, at: Date.now() }; batch.status = interrupted ? 'interrompido' : 'etapa_2_pronta';
                batch.log.push({ at: Date.now(), text: `PDF completo preparado: ${result.selected} documentos, ${result.pages} páginas, ${result.bytes} bytes.` });
                await persist(); message(interrupted ? 'Interrompido. PDF e progresso preservados.' : 'Etapa 1 pronta. Confira as peças marcadas e o PDF exibido. Próxima etapa: conversa nova com o agente.');
            } catch (error) {
                batch.status = interrupted ? 'interrompido' : 'erro_pdf'; batch.log.push({ at: Date.now(), text: error.message }); await persist(); message(interrupted ? 'Interrompido. O lote não avançará.' : error.message);
            } finally { busy = false; render(); }
        };
        function callCopilot(command) {
            return new Promise((resolve, reject) => {
                const id = crypto.randomUUID();
                const cleanup = () => { clearTimeout(timer); clearTimeout(ackTimer); window.removeEventListener('message', listener); };
                const listener = event => {
                    if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.id !== id) return;
                    if (event.data.type === 'superproc:saneador-copilot-ack') { clearTimeout(ackTimer); return; }
                    if (event.data.type === 'superproc:saneador-copilot-progress') {
                        if (!interrupted) message(event.data.text);
                        batch.copilotProgress = { phase: event.data.phase, text: event.data.text, at: Date.now() };
                        if (['anexo','anexo_pronto','resposta','concluido'].includes(event.data.phase)) advance('copilot',0);
                        if (['resposta','concluido'].includes(event.data.phase)) advance('copilot',1);
                        set(key, batch).catch(() => {});
                        return;
                    }
                    if (event.data.type !== 'superproc:saneador-copilot-result') return;
                    cleanup(); event.data.result?.error ? reject(new Error(event.data.result.error)) : resolve(event.data.result);
                };
                const timer = setTimeout(() => { cleanup(); reject(new Error('A etapa 2 excedeu o prazo. Abra o Copilot para conferir o estado antes de repetir.')); }, 1100000);
                const ackTimer = setTimeout(() => { cleanup(); reject(new Error('A ponte do Copilot não respondeu. Reinicie o SuperPROC Browser atualizado.')); }, 5000);
                window.addEventListener('message', listener);
                window.postMessage({ type: 'superproc:saneador-copilot', id, process, sha256: batch?.pdf?.sha256, command, config: batch.config }, location.origin);
            });
        }
        panel.querySelector('[data-show-copilot]').onclick = () => callCopilot('show').catch(error => message(error.message));
        panel.querySelector('[data-copilot]').onclick = async () => {
            if (busy || !batch?.pdf || batch.copilot) return;
            resumeExecution();
            busy = true; batch.status = 'enviando_copilot'; await persist(); render();
            try {
                message(`Etapa 2: preparando conversa nova com ${batch.agent}…`);
                const result = await callCopilot('run');
                if (result?.process !== process || result?.agent !== batch.agent || result?.sha256 !== batch.pdf.sha256 || typeof result?.text !== 'string' || result.text.length < 80) {
                    const failures = [result?.process !== process && 'processo', result?.agent !== batch.agent && 'agente', result?.sha256 !== batch.pdf.sha256 && 'PDF', (typeof result?.text !== 'string' || result.text.length < 80) && 'texto da resposta'].filter(Boolean);
                    batch.copilotDiagnostic = { at: Date.now(), fields: Object.keys(result || {}), failures, process: result?.process, agent: result?.agent, textLength: typeof result?.text === 'string' ? result.text.length : 0 };
                    throw new Error('Retorno do Copilot incompleto: ' + failures.join(', ') + '. Confira a janela e exporte o progresso.');
                }
                batch.copilot = result; batch.status = interrupted ? 'interrompido' : 'etapa_3_pronta';
                batch.log.push({ at: Date.now(), text: `Resposta do ${result.agent} recebida: ${result.text.length} caracteres. Conversa: ${result.conversationUrl}.` });
                await persist(); message(interrupted ? 'Interrompido. Resposta preservada; nenhuma minuta será iniciada automaticamente.' : 'Etapa 2 pronta. Resposta preservada. Próxima etapa: lançar a minuta.');
            } catch (error) { batch.status = interrupted ? 'interrompido' : 'erro_copilot'; batch.log.push({ at: Date.now(), text: error.message }); await persist(); message(interrupted ? 'Interrompido. O lote não avançará.' : error.message); }
            finally { busy = false; render(); }
            if (batch.autoMinuta && batch.status === 'etapa_3_pronta') await panel.querySelector('[data-minuta]').onclick(true);
        };
        panel.querySelector('[data-interrupt]').onclick = async () => {
            if (!batch || interrupted) return;
            interrupted = true; batch.autoMinuta = false; batch.autoThrough3 = false;
            locatorController?.abort();
            batch.running = false;
            batch.interruptedAt = Date.now(); batch.status = 'interrompido';
            batch.log.push({ at: Date.now(), text: 'Usuário interrompeu a execução. Nenhum próximo processo será aberto.' });
            message('INTERROMPIDO. Cancelando comandos em andamento; progresso e abas existentes serão preservados.');
            // Envia antes de aguardar o storage para interromper o host imediatamente.
            if (/^\d{20}$/.test(process)) window.postMessage({ type: 'superproc:saneador-interrupt', id: crypto.randomUUID(), process }, location.origin);
            await persist();
        };
        panel.querySelector('[data-minuta]').onclick = async automatic => {
            if (busy || !batch?.copilot || batch.localizador) return;
            if (automatic === true && interrupted) return;
            resumeExecution();
            if (automatic !== true) batch.autoMinuta = true;
            busy = true;
            const resume = !!batch.minutaAttempt;
            batch.minutaAttempt ||= { jobId: crypto.randomUUID(), at: Date.now() };
            batch.status = 'criando_minuta'; await persist();
            try {
                const result = batch.minuta || await new Promise((resolve, reject) => {
                    const id = crypto.randomUUID();
                    const cleanup = () => { clearTimeout(timer); clearTimeout(ackTimer); window.removeEventListener('message', listener); };
                    const listener = event => {
                        if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.id !== id) return;
                        if (event.data.type === 'superproc:saneador-minuta-ack') { clearTimeout(ackTimer); return; }
                        if (event.data.type === 'superproc:saneador-minuta-progress') {
                            batch.minutaAttempt = { ...batch.minutaAttempt, phase: event.data.phase, editorUrl: event.data.editorUrl };
                            if (['conteudo','salvando','done'].includes(event.data.phase)) advance('minuta',0);
                            if (!interrupted) message(event.data.text); set(key, batch).catch(() => {}); return;
                        }
                        if (event.data.type !== 'superproc:saneador-minuta-result') return;
                        cleanup();
                        if (event.data.result?.error) {
                            const details = Object.fromEntries(Object.entries(event.data.result).filter(([, value]) => value !== undefined));
                            batch.minutaAttempt = !resume && event.data.result.started === false ? null : { ...batch.minutaAttempt, ...details };
                            reject(new Error(event.data.result.error));
                        }
                        else resolve(event.data.result);
                    };
                    const timer = setTimeout(() => { cleanup(); reject(new Error('O lançamento excedeu o prazo. Confira a aba da minuta; o cadastro não será repetido automaticamente.')); }, 500000);
                    const ackTimer = setTimeout(() => { cleanup(); reject(new Error('A ponte da minuta não respondeu. Reinicie o navegador atualizado para habilitar o lançamento da minuta.')); }, 5000);
                    window.addEventListener('message', listener);
                    window.postMessage({ type: 'superproc:saneador-minuta', id, process, text: batch.copilot.text, jobId: batch.minutaAttempt.jobId, resume, config: batch.config }, location.origin);
                });
                if (result.process !== process || !result.savedAt || !result.closed) throw new Error('A minuta não foi confirmada como salva e fechada para este processo.');
                batch.minuta = result; batch.status = interrupted ? 'interrompido' : 'etapa_4_pronta';
                const item = batch.items.find(i => i.id === process);
                item.status = 'minuta_salva'; item.minuta = result; item.copilot = batch.copilot; item.pdf = batch.pdf;
                batch.log.push({ at: Date.now(), text: `Minuta salva e aba fechada: ${item.numero}. ${result.characters} caracteres.` });
                await persist(); message(interrupted ? 'Interrompido. Minuta já salva preservada; o lote não avançará.' : 'Minuta salva e aba fechada.');
                if (!interrupted) {
                    batch.status = 'inserindo_localizador'; await persist();
                    message(`Inserindo ${batch.targetLocator} e preservando os outros localizadores...`);
                    locatorController = new AbortController();
                    batch.localizador = await inserirLocalizadorSaneador({ signal: locatorController.signal, target: batch.config.targetLocator, check: () => { if (interrupted) throw new Error('Interrompido pelo usuário.'); } });
                    item.localizador = batch.localizador; item.status = 'concluido';
                    batch.status = 'etapa_5_pronta';
                    batch.log.push({ at: Date.now(), text: `Localizador ${batch.targetLocator} confirmado: ${item.numero}.` });
                    await persist(); message(`Minuta salva e ${batch.targetLocator} confirmado.`);
                }
                if (!interrupted && batch.autoMinuta && batch.localizador) {
                    const next = firstPending(batch);
                    if (next) {
                        batch.currentId = next.id; next.status = 'verificacao';
                        batch.pdf = null; batch.copilot = null; batch.minuta = null; batch.localizador = null; batch.minutaAttempt = null;
                        batch.workflow = {}; batch.copilotProgress = null; batch.checks.carregamento = false; batch.autoThrough3 = true;
                        batch.status = 'abrindo_proximo';
                        batch.log.push({ at: Date.now(), text: `Abrindo próximo pendente: ${next.numero}.` });
                        publishNavigation(batch.items, batch.name); await persist();
                        if (interrupted) {
                            // O clique pode ocorrer enquanto o storage confirma o avanço.
                            // A capa ainda é a atual; não deixa a fila apontar para outra.
                            next.status = 'pendente'; batch.currentId = process;
                            batch.pdf = item.pdf; batch.copilot = item.copilot; batch.minuta = item.minuta; batch.localizador = item.localizador;
                            batch.checks.carregamento = true; batch.autoThrough3 = false; batch.status = 'interrompido';
                            await persist();
                        } else location.assign(next.url);
                    } else { batch.running = false; batch.status = 'lote_minutas_concluido'; batch.autoMinuta = false; await persist(); message(`Todos os pendentes têm minuta salva e ${batch.targetLocator} confirmado.`); }
                }
            } catch (error) { batch.status = interrupted ? 'interrompido' : batch.minuta ? 'erro_localizador' : 'erro_minuta'; batch.log.push({ at: Date.now(), text: error.message }); await persist(); message(interrupted ? 'Interrompido. A minuta existente permanece aberta para conferência; o lote não avançará.' : error.message); }
            finally { locatorController = null; busy = false; render(); }
        };
        const startButton = panel.querySelector('[data-start]');
        if(startButton) startButton.onclick = async () => {
            if(busy) return; resumeExecution(); batch.autoMinuta = true; await persist();
            if(batch.localizador) { batch.autoThrough3 = true; await openFirst(); }
            else if(batch.copilot) await panel.querySelector('[data-minuta]').onclick(true);
            else { if(!batch.pdf) await panel.querySelector('[data-pdf]').onclick(); if(batch.pdf && !interrupted) await panel.querySelector('[data-copilot]').onclick(); }
        };
        panel.querySelector('[data-export]').onclick = () => {
            const blob = new Blob([JSON.stringify(batch, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = `superproc-saneador-progresso-${batch.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        if (!isList) {
            // Aguarda a capa nativa, com limite. Nunca marca o processo como saneado.
            const start = Date.now();
            const timer = setInterval(async () => {
                const ready = document.readyState === 'complete' && !!document.querySelector('#fldCapa, #divCapaProcesso, #fldCapaProcesso, #divInfraAreaProcesso, #div-acoes-preferenciais, #fldMinutas');
                if (interrupted) {
                    if (ready) { clearInterval(timer); markLoaded(batch, process); batch.status = 'interrompido'; await persist(); message('Lote interrompido. Progresso preservado.'); }
                    else if (Date.now() - start > 60000) clearInterval(timer);
                    return;
                }
                if (ready) {
                    clearInterval(timer);
                    if (markLoaded(batch, process)) await persist();
                    if (batch.autoThrough3) {
                        // Consome a intenção antes do primeiro efeito: recarregar não reenvia documentos.
                        batch.autoThrough3 = false;
                        batch.log.push({ at: Date.now(), text: 'Execução automática das etapas 1 a 3 iniciada para o processo aberto.' });
                        await persist();
                        await panel.querySelector('[data-pdf]').onclick();
                        if (batch.status === 'etapa_2_pronta') await panel.querySelector('[data-copilot]').onclick();
                        return;
                    }
                    if (!busy) message(batch.copilot ? 'Etapa 2 pronta. Resposta preservada no painel.' : batch.pdf ? 'Etapa 1 pronta. Confira as peças marcadas e o PDF exibido.' : batch.verifiedAt ? 'Etapa 1 já conferida. A fila e o registro estão armazenados.' : 'Etapa 1 pronta: confira o número do processo e a navegação LISTA. O lote está parado para sua conferência.');
                } else if (Date.now() - start > 60000) { clearInterval(timer); batch.status = 'erro_carregamento'; batch.log.push({ at: Date.now(), text: 'A capa não foi identificada no prazo; nenhuma operação processual foi feita.' }); await persist(); message('Não confirmei o carregamento da capa em 60 segundos. Confira a sessão do eProc.'); }
            }, 500);
        } else if (batch) message(batch.verifiedAt ? 'Etapa 1 já conferida. A fila e o registro estão armazenados.' : 'Fila anterior disponível. Reabrir o primeiro pendente preserva o registro.');
        render();
    }
};
