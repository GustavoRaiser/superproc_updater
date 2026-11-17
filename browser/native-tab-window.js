// Chromium entrega opções de BrowserWindow para createWindow(). Elas não são
// opções de WebContentsView: em algumas disposições (especialmente clique do
// meio), `options.webContents` é um objeto interno, não um WebContents válido.
// Passá-lo diretamente ao WebContentsView provoca a exceção no processo main.
// foreground-tab também ocorre em links normais target=_blank. Só o pedido
// de aba em segundo plano ou o clique da roda identificado é autônomo.
function shouldUnifyNativeTab(details) {
  return !details.middleClick && details.disposition !== 'background-tab';
}

// decidirAbertura(details) -> { destino: 'janela' | 'aba', unificar } (ver open-mode.js). Sem ela, tudo
// vira aba, como antes. Com destino 'janela', o Electron cria uma janela do sistema (barra nativa) que
// herda sessão e opener; getWindowOptions() acrescenta as opções da janela.
function nativeTabWindowHandler(WebContentsView, registerView, onError, getInheritedPreferences = () => ({}),
  decidirAbertura = null, getWindowOptions = () => ({})) {
  return (details) => {
    const decisao = decidirAbertura ? decidirAbertura(details) : null;
    if (decisao && decisao.destino === 'janela') {
      return {
        action: 'allow',
        outlivesOpener: true,
        overrideBrowserWindowOptions: {
          ...getWindowOptions(details),
          frame: true,
          webPreferences: { ...getInheritedPreferences() }
        }
      };
    }
    return abrirComoAba(details, decisao);
  };

  function abrirComoAba(details, decisao) {
    return {
      action: 'allow',
      outlivesOpener: true,
      createWindow: (options) => {
        const suppliedWebContents = options?.webContents;
        const canAdoptSuppliedWebContents = suppliedWebContents &&
          typeof suppliedWebContents.loadURL === 'function' &&
          typeof suppliedWebContents.isDestroyed === 'function';

        // Nunca repassar as opções completas de BrowserWindow: WebContentsView
        // aceita somente webPreferences e, opcionalmente, um WebContents real.
        const view = canAdoptSuppliedWebContents
          ? new WebContentsView({ webContents: suppliedWebContents })
          : new WebContentsView({ webPreferences: { ...options?.webPreferences, ...getInheritedPreferences() } });
        registerView(view, details, decisao);
        // Para disposições como middle-click/ctrl-click não há um WebContents
        // adotável. Carregamos a requisição original diretamente na nova aba.
        if (!canAdoptSuppliedWebContents) {
          const loadOptions = {};
          if (details.referrer) loadOptions.httpReferrer = details.referrer;
          if (details.postBody) {
            loadOptions.postData = details.postBody.data;
            loadOptions.extraHeaders = `Content-Type: ${details.postBody.contentType}\n`;
          }
          view.webContents.loadURL(details.url, loadOptions).catch(onError);
        }
        return view.webContents;
      }
    };
  }
}

module.exports = { nativeTabWindowHandler, shouldUnifyNativeTab };
