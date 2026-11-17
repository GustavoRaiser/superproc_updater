'use strict';
// Identidade (número CNJ), política de registro e migração do histórico de processos acessados.
// Sem dependência de Electron: testável em Node puro.
const UMA_HORA = 60 * 60 * 1000;
const PARAMETROS_NUMERO = ['num_processo', 'numProcesso', 'txtNumProcesso'];

const somenteDigitos = value => String(value ?? '').replace(/\D/g, '');

// Dígito verificador do número único (Resolução CNJ 65): 98 - (NNNNNNN AAAA JTR OOOO 00 mod 97).
function cnjValido(digitos) {
  if (!/^\d{20}$/.test(digitos)) return false;
  const resto = BigInt(digitos.slice(0, 7) + digitos.slice(9) + '00') % 97n;
  return String(98n - resto).padStart(2, '0') === digitos.slice(7, 9);
}
function normalizarCnj(value) { const d = somenteDigitos(value); return cnjValido(d) ? d : ''; }
function formatarCnj(digitos) {
  const d = somenteDigitos(digitos);
  return d.length === 20 ? d.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6') : String(digitos ?? '');
}

// Só aceita número completo e com dígito verificador válido: parcial ("5005524-81") ou sequência
// qualquer de 20 dígitos (ids de localizador, etc.) não vira processo.
function extrairCnj(url, title) {
  try {
    const u = new URL(url);
    for (const key of PARAMETROS_NUMERO) { const d = normalizarCnj(u.searchParams.get(key)); if (d) return d; }
  } catch { /* URL inválida: tenta o título */ }
  const texto = String(title || '');
  const formatado = texto.match(/(?<!\d)\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}(?!\d)/);
  if (formatado) { const d = normalizarCnj(formatado[0]); if (d) return d; }
  const corrido = texto.match(/(?<!\d)\d{20}(?!\d)/);
  return corrido ? normalizarCnj(corrido[0]) : '';
}

// `lista` está do mais recente para o mais antigo. Regras: o mesmo processo não é gravado duas
// vezes em sequência, nem se a última gravação dele tem menos de uma hora (recarga de página,
// fechamento equivocado etc.).
function deveRegistrar(lista, digitos, agora = Date.now(), intervalo = UMA_HORA) {
  if (!digitos) return false;
  const itens = Array.isArray(lista) ? lista : [];
  if (itens[0] && itens[0].digits === digitos) return false;
  const ultimo = itens.find(item => item && item.digits === digitos);
  return !ultimo || agora - ultimo.timestamp >= intervalo;
}

// Registros antigos guardavam só "NNNNNNN-DD" e uma URL. Recupera o número completo quando a URL
// ou o título o contêm e descarta a URL (a assinatura deve vir de uma página nova).
function migrarEntrada(entrada) {
  if (!entrada || typeof entrada !== 'object') return null;
  // Campos de origem em link (url, title) não pertencem ao histórico de processos: sempre se abre a capa.
  const { url, title, ...resto } = entrada;
  const digits = normalizarCnj(entrada.digits) || normalizarCnj(entrada.procNumber) || extrairCnj(url, title);
  return digits ? { ...resto, digits, procNumber: formatarCnj(digits) } : { ...resto, digits: '', incompleto: true };
}

// URLs de autenticação (SSO/Keycloak, callback do eproc, login/logout) são de uso único: carregam
// nonce/state/session_state e, reabertas depois, caem no aviso "Usuário logado como…". Não entram no histórico.
function urlDeAutenticacao(url) {
  try {
    const u = new URL(url);
    if (/^sso\./i.test(u.hostname)) return true;
    if (/\/(realms|protocol\/openid-connect|login-actions)\b|externo_controlador/i.test(u.pathname)) return true;
    const q = u.searchParams;
    if (q.has('nonce') || q.has('session_state') || (q.has('state') && q.has('code'))) return true;
    return /^(entrar|login|logout|sair|login_cert|logout_cert)(_|$)/i.test(q.get('acao') || '');
  } catch { return false; }
}

module.exports = { urlDeAutenticacao, UMA_HORA, cnjValido, normalizarCnj, formatarCnj, extrairCnj, deveRegistrar, migrarEntrada };
