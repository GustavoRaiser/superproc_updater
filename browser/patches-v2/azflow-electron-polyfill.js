// SuperPROC Electron Compatibility Polyfill
if (typeof chrome !== 'undefined') {
  if (!chrome.windows) {
    let _nextWinId = 1000;
    const _winMap = new Map();
    chrome.windows = {
      WINDOW_ID_NONE: -1,
      WINDOW_ID_CURRENT: -2,
      get: async (id, opts) => ({
        id: id || 1,
        focused: true,
        state: 'normal',
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        tabs: opts?.populate ? (_winMap.get(id || 1) || [{ id: 1, active: true }]) : undefined
      }),
      getCurrent: async () => ({ id: 1, focused: true, state: 'normal', left: 0, top: 0, width: 1920, height: 1080 }),
      getAll: async () => [{ id: 1, focused: true, state: 'normal', left: 0, top: 0, width: 1920, height: 1080 }],
      create: async (data) => {
        const wid = _nextWinId++;
        const tab = { id: wid * 10, url: data?.url, active: true, windowId: wid };
        _winMap.set(wid, [tab]);
        if (chrome.tabs && chrome.tabs.create) {
          try {
            const created = await chrome.tabs.create({ url: data?.url, active: true });
            if (created) return { id: wid, tabs: [created] };
          } catch (_) {}
        }
        return { id: wid, tabs: [tab] };
      },
      update: async (id, data) => ({ id: id || 1, ...data }),
      remove: async (id) => { _winMap.delete(id); },
      onCreated: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
      onRemoved: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
      onFocusChanged: { addListener: () => {}, removeListener: () => {}, hasListener: () => false }
    };
  }
  if (!chrome.system) chrome.system = {};
  if (!chrome.system.display) {
    chrome.system.display = {
      getInfo: async () => [{
        id: 'primary',
        name: 'Primary Display',
        isPrimary: true,
        bounds: { left: 0, top: 0, width: 1920, height: 1080 },
        workArea: { left: 0, top: 0, width: 1920, height: 1040 }
      }]
    };
  }
}
