// Hashes de links do eproc pertencem à URL/ação assinada, não são um token
// genérico que o navegador possa transplantar entre rotas.
function rememberEprocNavigationLinks(previous = {}, pageUrl, homeHref, locHref) {
  let page;
  try { page = new URL(pageUrl); } catch { return previous; }
  if (page.protocol !== 'https:' || !/^eproc[\w-]*\..*\.jus\.br$/i.test(page.hostname)) return previous;
  const links = { ...previous };
  const accept = (value, action, key) => {
    try {
      const url = new URL(value, page);
      if (url.origin === page.origin && url.pathname === page.pathname &&
          url.pathname.endsWith('/controlador.php') && url.searchParams.get('acao') === action &&
          url.searchParams.get('hash')) links[key] = url.href;
    } catch (_) {}
  };
  if (homeHref) accept(homeHref, 'principal', 'home');
  if (locHref) accept(locHref, 'usuario_tipo_monitoramento_localizador_listar', 'localizadores');
  // A navegação para a própria ação também é uma fonte válida, sem reconstrução.
  accept(page.href, 'principal', 'home');
  accept(page.href, 'usuario_tipo_monitoramento_localizador_listar', 'localizadores');
  return links;
}

module.exports = { rememberEprocNavigationLinks };
