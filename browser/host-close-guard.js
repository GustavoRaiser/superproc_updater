'use strict';

// Only main-process UI handlers can grant a one-use host-close authorization.
function protectHostWindow(win, onBlocked = () => {}) {
  let authorized = false;
  win.on('close', event => {
    if (!authorized) {
      event.preventDefault();
      onBlocked();
    }
    authorized = false;
  });
  // Do not prevent Windows shutdown/logoff.
  win.on('query-session-end', () => { authorized = true; });
  return {
    closeFromUser() {
      if (win.isDestroyed()) return;
      authorized = true;
      try { win.close(); } finally { authorized = false; }
    },
    isTrustedSender(event) {
      return !win.isDestroyed() && event.sender === win.webContents &&
        event.senderFrame === win.webContents.mainFrame;
    }
  };
}

// BrowserWindow.close does not carry a child sender. Only accept a focused
// editor belonging to a group; never fall back to whichever tab is active.
function findFocusedUnifiedEditor(tabs, focusedContents) {
  if (!focusedContents || focusedContents.isDestroyed()) return null;
  return tabs.find(tab => tab.groupId && tab.processRole === 'editor' &&
    !tab.isClosing && tab.view?.webContents === focusedContents) || null;
}

module.exports = { protectHostWindow, findFocusedUnifiedEditor };
