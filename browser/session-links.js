'use strict';
const { rememberEprocNavigationLinks } = require('./eproc-navigation');
const AUTH = /(?:logout|logoff|sair|login|autenticar|encerrar_sessao)/i;
class SessionLinks {
  constructor() {
    this.sessions = new WeakMap();
    this.profileOrigins = new WeakMap();
  }
  origin(value) { try { const u = new URL(value); return u.protocol === 'https:' && /^eproc[\w-]*\..*\.jus\.br$/i.test(u.hostname) ? u.origin : ''; } catch { return ''; } }
  profileOrigin(session, initialPage) {
    if (!this.profileOrigins.has(session)) {
      const origin = this.origin(initialPage);
      if (origin) this.profileOrigins.set(session, origin);
    }
    return this.profileOrigins.get(session) || '';
  }
  state(session) { if (!this.sessions.has(session)) this.sessions.set(session, new Map()); return this.sessions.get(session); }
  invalidate(session, value) { const origin = this.origin(value); if (origin) this.state(session).delete(origin); }
  transition(session, value) { try { const u = new URL(value); if (AUTH.test(u.searchParams.get('acao') || '') || /\/(?:login|logout)\b/i.test(u.pathname)) { this.invalidate(session, value); return true; } } catch {} return false; }
  remember(session, page, home, localizadores) {
    const origin = this.origin(page); if (!origin) return {};
    this.profileOrigin(session, page);
    const previous = this.state(session).get(origin) || {};
    const links = rememberEprocNavigationLinks(previous, page, home, localizadores);
    const state = this.state(session);
    state.delete(origin); state.set(origin, links); // o último eproc visto fica sempre no fim
    return links;
  }
  get(session, page) { return this.state(session).get(this.origin(page)) || {}; }
  // Último eproc visto na sessão, independente da origem inicial do perfil.
  last(session) {
    let found = null;
    for (const entry of this.state(session)) found = entry;
    return found ? { origin: found[0], links: found[1] } : { origin: '', links: {} };
  }
}
module.exports = { SessionLinks };
