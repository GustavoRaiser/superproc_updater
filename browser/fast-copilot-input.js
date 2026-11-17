'use strict';
// Fast Copilot no Editor (host): bloqueio curto de teclado e mouse da aba por CDP, SEM barreira visual.
// Usado só pelos milissegundos da troca de texto, quando a aba do editor está visível. Alt+F4 continua com o
// Windows (a janela não recebe a tecla pela página). Se o CDP não estiver disponível (ex.: outro depurador),
// aplica sem bloqueio: o bloqueio só reduz o risco de conflito, nunca impede a operação.

async function comBloqueio(wc, fn, { bloquear = true, limiteMs = 1500, log = () => {} } = {}) {
  if (!bloquear || !wc || !wc.debugger) return fn();
  const dbg = wc.debugger;
  let proprio = false, ativo = false, liberado = false;
  const liberar = async () => {
    if (liberado) return; liberado = true;
    if (ativo) await dbg.sendCommand('Input.setIgnoreInputEvents', { ignore: false }).catch((e) => log('liberar', e.message));
    if (proprio && dbg.isAttached()) { try { dbg.detach(); } catch (_) {} }
  };
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); proprio = true; }
    await dbg.sendCommand('Input.setIgnoreInputEvents', { ignore: true });
    ativo = true;
  } catch (e) { log('bloquear', e.message); }
  const seguranca = setTimeout(() => { liberar(); }, limiteMs); // nunca deixa a aba presa
  seguranca.unref?.();
  try { return await fn(); }
  finally { clearTimeout(seguranca); await liberar(); }
}

module.exports = { comBloqueio };
