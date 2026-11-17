/**
 * SuperPROC - Módulo: Reconhecer login (SSO do TJSC)
 *
 * O que faz: na tela de login do SSO do TJSC, quando o usuário já foi reconhecido (o nome de usuário vem preenchido),
 *   clica sozinho no botão "Continuar". Evita o clique manual ao reabrir o navegador e acessar ferramentas internas.
 * Onde roda: sso.tjsc.jus.br.
 * Dados: guarda só a hora do último clique automático em sessionStorage (limita a um clique a cada 30 s; nunca repete
 *   em loop se o login falhar). Não lê nem grava senha.
 */

export default {
    init() {
        const CHAVE_ULTIMO_CLIQUE = 'superproc_sso_continuar_ultimo_clique';
        const INTERVALO_MIN_MS = 30000;
        const LIMITE_ESPERA_MS = 10000;

        function visivel(el) {
            return !!el && !el.disabled && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
        }

        function achaBotaoContinuar() {
            const candidatos = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
            return Array.from(candidatos).find((el) => {
                const texto = (el.value || el.textContent || '').trim().toLowerCase();
                return texto === 'continuar' && visivel(el);
            }) || null;
        }

        function prontoParaContinuar() {
            // Usuário ainda não identificado: o clique só geraria erro de campo vazio.
            const usuario = document.querySelector('input#username, input[name="username"]');
            if (usuario && visivel(usuario) && !usuario.value.trim()) return false;
            // Senha pedida e vazia: o usuário precisa digitar.
            const senha = document.querySelector('input[type="password"]');
            if (senha && visivel(senha) && !senha.value) return false;
            // Mensagem de erro da tentativa anterior: não insiste.
            if (document.querySelector('.alert-error, .pf-m-danger, [id^="input-error"], .kc-feedback-text')) return false;
            return true;
        }

        function jaClicouRecentemente() {
            try {
                const ultimo = Number(sessionStorage.getItem(CHAVE_ULTIMO_CLIQUE)) || 0;
                return Date.now() - ultimo < INTERVALO_MIN_MS;
            } catch (_) { return false; }
        }

        function tentar() {
            const botao = achaBotaoContinuar();
            if (!botao || !prontoParaContinuar() || jaClicouRecentemente()) return false;
            try { sessionStorage.setItem(CHAVE_ULTIMO_CLIQUE, String(Date.now())); } catch (_) { /* sem sessionStorage */ }
            botao.click();
            return true;
        }

        if (tentar()) return;
        const inicio = Date.now();
        const intervalo = setInterval(() => {
            if (tentar() || Date.now() - inicio > LIMITE_ESPERA_MS) clearInterval(intervalo);
        }, 300);
    }
};
