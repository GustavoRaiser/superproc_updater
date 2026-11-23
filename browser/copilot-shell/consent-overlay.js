'use strict';
// Página local do cartão de consentimento. Só informa ao host qual botão foi escolhido.
(() => {
  const permitir = document.getElementById('permitir');
  const negar = document.getElementById('negar');
  let enviado = false;
  const decidir = (valor) => {
    if (enviado) return;
    enviado = true;
    permitir.disabled = true;
    negar.disabled = true;
    window.consentimentoCopilot.decidir(valor);
  };
  permitir.addEventListener('click', () => decidir(true));
  negar.addEventListener('click', () => decidir(false));
})();
