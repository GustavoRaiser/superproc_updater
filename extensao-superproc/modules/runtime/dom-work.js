// A single scheduled pass, bounded fallback, and explicit lifecycle.
export function domWork({ run, root = document.body, fallback = 5000, events = [], hidden = false, observe = true }) {
    let timer, interval, running = false, stopped = false, pending = false;
    const observer = new MutationObserver(schedule);
    const connect = () => { if (observe && root && !stopped) observer.observe(root, { childList: true, subtree: true }); };
    async function pass() {
        clearTimeout(timer); timer = null;
        if (stopped || (!hidden && document.hidden)) return;
        if (running) { pending = true; return; }
        running = true; observer.disconnect();
        try { await run(); } catch { /* feature retains its own visible error handling */ }
        finally { running = false; connect(); if (pending) { pending = false; schedule(); } }
    }
    function schedule() { if (!timer && !stopped) timer = setTimeout(pass, 100); }
    const visibility = () => { if (!document.hidden) schedule(); };
    function start() { stopped = false; connect(); if (fallback) interval = setInterval(schedule, fallback); schedule(); }
    function stop() { stopped = true; clearTimeout(timer); timer = null; clearInterval(interval); observer.disconnect(); }
    for (const event of events) document.addEventListener(event, schedule, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', event => { if (event.persisted && stopped) start(); });
    start(); return { schedule, stop };
}
